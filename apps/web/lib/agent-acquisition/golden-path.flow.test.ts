import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  verifyCapability: vi.fn(),
  tokenHash: vi.fn(),
  claimUrl: vi.fn(),
  lookupReach: vi.fn(),
  admission: vi.fn(),
  handleAvailability: vi.fn(),
  catalogPreview: vi.fn(),
  valueBeforePaywall: vi.fn(),
  profileByUsername: vi.fn(),
  creatorName: vi.fn(),
  dbUpdate: vi.fn(),
  dbSelectRows: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (value: unknown) => {
        mocks.dbUpdate(value);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.dbSelectRows()),
        }),
      }),
    }),
  },
}));
vi.mock('./draft-store', () => ({
  loadAgentDraftForMutation: mocks.loadDraft,
}));
vi.mock('./draft-capability', () => ({
  verifyDraftCapability: mocks.verifyCapability,
  draftTokenHash: mocks.tokenHash,
}));
vi.mock('./claim-handoff', () => ({
  agentClaimUrl: mocks.claimUrl,
}));
vi.mock('@/lib/claim/claim-verification.server', () => ({
  lookupArtistReach: mocks.lookupReach,
}));
vi.mock('@/lib/waitlist/golden-path-admission.server', () => ({
  decideGoldenPathAdmissionForArtist: mocks.admission,
}));
vi.mock('@/lib/onboarding/reserved-handle', () => ({
  checkOnboardingHandleAvailability: mocks.handleAvailability,
}));
vi.mock('@/lib/onboarding/catalog-preview.server', () => ({
  fetchOnboardingCatalogPreview: mocks.catalogPreview,
  isValueBeforePaywallEnabled: mocks.valueBeforePaywall,
}));
vi.mock('@/lib/services/profile/queries', () => ({
  getProfileByUsername: mocks.profileByUsername,
}));
vi.mock('@/lib/agent/public-catalog', () => ({
  publicCreatorName: mocks.creatorName,
}));

import { executeAgentDraftTool } from './api';
import { GOLDEN_PATH_WAITLIST_COPY } from './golden-path';

/**
 * End-to-end golden path through the SAME dispatch the /api/mcp route uses:
 * claim -> mom-test -> qualify -> setup -> publish -> share -> upgrade.
 * All IO is mocked; no Stripe, no database, no network.
 */
const DRAFT_ID = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const TOKEN = 'g'.repeat(120);
const REF = { draft_id: DRAFT_ID, draft_token: TOKEN };
const CLAIM_URL = `https://jov.ie/claim/agent/${DRAFT_ID}?h=handoff`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbSelectRows.mockImplementation(() =>
    state.draft ? [state.draft] : []
  );
  /** Minimal in-memory stand-in for the draft row + preview write. */
  const state: { draft: Record<string, unknown> | null } = { draft: null };
  const baseDraft = () => ({
    id: DRAFT_ID,
    claimedAt: null as Date | null,
    capabilityHash: 'hash',
    expiresAt: new Date(Date.now() + 86_400_000),
    acquisition: {},
    preview: {
      artist_id: 'spotify:4Z8W4fKeB5YxbusR9QnbSa',
      provider: 'spotify',
      external_id: '4Z8W4fKeB5YxbusR9QnbSa',
      display_name: 'Signal Artist',
      source_url: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusR9QnbSa',
      image_url: null,
      bio: null,
      genres: [] as string[],
    },
  });
  mocks.claimUrl.mockReturnValue(CLAIM_URL);
  mocks.tokenHash.mockReturnValue('hash');
  mocks.verifyCapability.mockReturnValue({
    draft_id: DRAFT_ID,
    artist_id: 'spotify:4Z8W4fKeB5YxbusR9QnbSa',
  });
  state.draft = baseDraft();
  mocks.dbUpdate.mockImplementation((value: { preview: unknown }) => {
    if (state.draft) {
      state.draft = { ...state.draft, preview: value.preview };
    }
    return Promise.resolve(undefined);
  });
  mocks.loadDraft.mockImplementation(() => Promise.resolve(state.draft));
  mocks.lookupReach.mockResolvedValue({
    followers: 1_200,
    name: 'Signal Artist',
  });
  mocks.handleAvailability.mockResolvedValue({
    handle: 'signalandartist',
    available: true,
    reason: 'available',
  });
  mocks.admission.mockResolvedValue({
    admit: true,
    reason: 'admit_resolved_artist',
  });
  mocks.valueBeforePaywall.mockReturnValue(true);
  mocks.catalogPreview.mockResolvedValue(null);
});

describe('golden path end-to-end (mocked IO)', () => {
  it('walks claim -> mom-test -> qualify -> setup -> publish -> share -> upgrade', async () => {
    // 1. claim
    const claim = await executeAgentDraftTool('claim_handle', {
      ...REF,
      handle: 'signalandartist',
    });
    expect(claim).toMatchObject({
      status: 'reserved',
      requires_verification: false,
      claim_url: CLAIM_URL,
      next_action: 'send_user_claim_url',
    });

    // 2. mom test (two answers)
    const growth = await executeAgentDraftTool('answer_onboarding_question', {
      ...REF,
      question: 'lastGrowthAttempt',
      answer: 'Ran a pre-save. About 40 signups.',
    });
    expect(growth).toMatchObject({
      status: 'recorded',
      recorded: 'lastGrowthAttempt',
    });
    const spend = await executeAgentDraftTool('answer_onboarding_question', {
      ...REF,
      question: 'promoSpend',
      answer: 'under_50',
    });
    expect(spend).toMatchObject({
      status: 'recorded',
      remaining_questions: [],
      next_action: 'get_qualification',
    });

    // 3. qualify
    const qualification = await executeAgentDraftTool('get_qualification', REF);
    expect(qualification).toMatchObject({
      status: 'qualified',
      reason: 'admit_resolved_artist',
      next_action: 'build_profile',
    });

    // 4. setup
    const setup = await executeAgentDraftTool('build_profile', REF);
    expect(setup).toMatchObject({ status: 'draft_ready', value_enabled: true });

    // 5. publish — the person publishes; the tool routes to claim_url
    const publish = await executeAgentDraftTool('publish_profile', {
      ...REF,
      confirmed: true,
    });
    expect(publish).toMatchObject({
      status: 'claim_required',
      claim_url: CLAIM_URL,
    });

    // 6. share (after the person publishes)
    mocks.profileByUsername.mockResolvedValue({
      username: 'SignalArtist',
      usernameNormalized: 'signalandartist',
      isPublic: true,
      displayName: 'Signal Artist',
    });
    mocks.creatorName.mockReturnValue('Signal Artist');
    const share = await executeAgentDraftTool('share_profile', {
      username: 'signalandartist',
    });
    expect(share).toMatchObject({
      status: 'ok',
      profile_url: 'https://jov.ie/signalandartist',
    });

    // 7. upgrade
    const upgrade = await executeAgentDraftTool('start_upgrade', REF);
    expect(upgrade).toMatchObject({
      status: 'ok',
      checkout_url: 'https://jov.ie/claim/start?spotify=4Z8W4fKeB5YxbusR9QnbSa',
    });
  });

  it('walks the queued branch with the locked not-qualified copy', async () => {
    mocks.admission.mockResolvedValue({
      admit: false,
      reason: 'hold_golden_path_not_green',
    });
    await executeAgentDraftTool('claim_handle', {
      ...REF,
      handle: 'signalandartist',
    });
    const qualification = await executeAgentDraftTool('get_qualification', REF);
    expect(qualification).toMatchObject({
      status: 'queued',
      message: GOLDEN_PATH_WAITLIST_COPY,
    });
  });
});
