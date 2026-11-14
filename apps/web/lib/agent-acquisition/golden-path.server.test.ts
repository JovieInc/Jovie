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
vi.mock('@/lib/claim/claim-verification', async importOriginal => ({
  ...(await importOriginal<object>()),
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

import { GOLDEN_PATH_WAITLIST_COPY } from './golden-path';
import {
  answerOnboardingQuestion,
  buildProfile,
  claimHandle,
  getQualification,
  publishProfile,
  shareProfile,
  startUpgrade,
} from './golden-path.server';

const DRAFT_ID = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const TOKEN = 'g'.repeat(120);
const REF = { draft_id: DRAFT_ID, draft_token: TOKEN };

const draftRow = (overrides: Record<string, unknown> = {}) => ({
  id: DRAFT_ID,
  claimedAt: null,
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
    genres: [],
    ...overrides,
  },
  ...overrides,
});

/** Minimal in-memory stand-in for the draft row + preview write. */
const state: { draft: ReturnType<typeof draftRow> | null } = { draft: null };

beforeEach(() => {
  vi.clearAllMocks();
  state.draft = draftRow();
  mocks.dbSelectRows.mockImplementation(() =>
    state.draft ? [state.draft] : []
  );
  mocks.claimUrl.mockReturnValue(
    `https://jov.ie/claim/agent/${DRAFT_ID}?h=handoff`
  );
  mocks.tokenHash.mockReturnValue('hash');
  mocks.verifyCapability.mockReturnValue({
    draft_id: DRAFT_ID,
    artist_id: 'spotify:4Z8W4fKeB5YxbusR9QnbSa',
  });
  mocks.dbUpdate.mockImplementation((value: { preview: unknown }) => {
    if (state.draft) {
      state.draft = {
        ...state.draft,
        preview: value.preview,
      } as ReturnType<typeof draftRow>;
    }
    return Promise.resolve(undefined);
  });
  // The draft store re-verifies the capability and returns the live row.
  mocks.loadDraft.mockImplementation(() => Promise.resolve(state.draft));
  mocks.lookupReach.mockResolvedValue({
    followers: 1_200,
    name: 'Signal Artist',
  });
});

describe('claim_handle', () => {
  it('reserves an available handle and routes the person to claim_url', async () => {
    mocks.handleAvailability.mockResolvedValue({
      handle: 'signalandartist',
      available: true,
      reason: 'available',
    });
    const result: Record<string, unknown> = await claimHandle({
      ...REF,
      handle: 'signalandartist',
    });
    expect(result.status).toBe('reserved');
    expect(result.reason).toBe('available');
    expect(result.claim_url).toBe(
      `https://jov.ie/claim/agent/${DRAFT_ID}?h=handoff`
    );
    expect(result.next_action).toBe('send_user_claim_url');
    expect(result.requires_verification).toBe(false);
    // The handle request is stored on the draft.
    expect(mocks.dbUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({
          golden_path: expect.objectContaining({ handle: 'signalandartist' }),
        }),
      })
    );
  });

  it('returns numbered alternatives for a taken handle and stores nothing', async () => {
    mocks.handleAvailability.mockResolvedValue({
      handle: 'radiohead',
      available: false,
      reason: 'taken',
      suggestedAlternatives: ['radiohead1', 'radiohead2'],
    });
    const result: Record<string, unknown> = await claimHandle({
      ...REF,
      handle: 'radiohead',
    });
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('taken');
    expect(result.suggested_alternatives).toEqual(['radiohead1', 'radiohead2']);
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it('routes high-reach artists to the existing verification path', async () => {
    mocks.handleAvailability.mockResolvedValue({
      handle: 'signalandartist',
      available: true,
      reason: 'available',
    });
    mocks.lookupReach.mockResolvedValue({ followers: 50_000, name: 'Big' });
    const result: Record<string, unknown> = await claimHandle({
      ...REF,
      handle: 'signalandartist',
    });
    expect(result.requires_verification).toBe(true);
    expect(result.next_action).toBe('send_user_claim_url_verification');
  });

  it('is unavailable without a live draft capability', async () => {
    mocks.loadDraft.mockResolvedValue(null);
    const result: Record<string, unknown> = await claimHandle({
      ...REF,
      handle: 'x',
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('DRAFT_UNAVAILABLE');
  });
});

describe('answer_onboarding_question', () => {
  it('records a growth answer and reports the remaining question', async () => {
    const result: Record<string, unknown> = await answerOnboardingQuestion({
      ...REF,
      question: 'lastGrowthAttempt',
      answer: 'Ran a pre-save. About 40 signups.',
    });
    expect(result.status).toBe('recorded');
    expect(result.recorded).toBe('lastGrowthAttempt');
    expect(result.remaining_questions).toEqual(['promoSpend']);
    expect(result.next_action).toBe('answer_onboarding_question');
  });

  it('points at qualification once both answers are stored', async () => {
    state.draft = draftRow({
      golden_path: {
        answers: { lastGrowthAttempt: 'Posted reels weekly.' },
      },
    });
    const result: Record<string, unknown> = await answerOnboardingQuestion({
      ...REF,
      question: 'promoSpend',
      answer: 'under_50',
    });
    expect(result.remaining_questions).toEqual([]);
    expect(result.next_action).toBe('get_qualification');
  });

  it('rejects a spend answer outside the locked bands', async () => {
    const result: Record<string, unknown> = await answerOnboardingQuestion({
      ...REF,
      question: 'promoSpend',
      answer: 'all the money',
    });
    expect(result.status).toBe('error');
    expect(result.code).toBe('INVALID_INPUT');
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});

describe('get_qualification', () => {
  it('returns qualified from the shared admission decision', async () => {
    mocks.admission.mockResolvedValue({
      admit: true,
      reason: 'admit_resolved_artist',
    });
    const result: Record<string, unknown> = await getQualification(REF);
    expect(result.status).toBe('qualified');
    expect(result.reason).toBe('admit_resolved_artist');
    expect(result.message).toBeUndefined();
    expect(result.next_action).toBe('build_profile');
    // The shared decision sees the server-confirmed artist and reach.
    expect(mocks.admission).toHaveBeenCalledWith({
      spotifyArtistId: '4Z8W4fKeB5YxbusR9QnbSa',
      reach: 1_200,
    });
  });

  it('returns queued with the locked copy when held', async () => {
    mocks.admission.mockResolvedValue({
      admit: false,
      reason: 'hold_golden_path_not_green',
    });
    const result: Record<string, unknown> = await getQualification(REF);
    expect(result.status).toBe('queued');
    expect(result.reason).toBe('hold_golden_path_not_green');
    expect(result.message).toBe(GOLDEN_PATH_WAITLIST_COPY);
    expect(result.next_action).toBe('send_user_claim_url');
  });

  it('reports recorded answers alongside the verdict', async () => {
    mocks.admission.mockResolvedValue({
      admit: false,
      reason: 'hold_capacity_full',
    });
    state.draft = draftRow({
      golden_path: {
        answers: { promoSpend: '50_plus' },
      },
    });
    const result: Record<string, unknown> = await getQualification(REF);
    expect(result.answers_recorded).toEqual({
      lastGrowthAttempt: null,
      promoSpend: '50_plus',
    });
  });
});

describe('build_profile', () => {
  it('attaches the value-before-paywall catalog preview for Spotify drafts', async () => {
    mocks.valueBeforePaywall.mockReturnValue(true);
    mocks.catalogPreview.mockResolvedValue({
      total: 12,
      releases: [
        {
          id: 'a1',
          title: 'First Light',
          releaseType: 'single',
          releaseDate: '2026-01-09',
          artworkUrl: null,
          spotifyUrl: 'https://open.spotify.com/album/a1',
        },
      ],
    });
    const result: Record<string, unknown> = await buildProfile(REF);
    expect(result.status).toBe('draft_ready');
    expect(result.catalog).toEqual({
      total: 12,
      releases: [expect.objectContaining({ title: 'First Light' })],
    });
    expect(result.value_enabled).toBe(true);
    expect(result.next_action).toBe('get_qualification');
  });

  it('stays identity-only when the preview is disabled or unreachable', async () => {
    mocks.valueBeforePaywall.mockReturnValue(false);
    mocks.catalogPreview.mockResolvedValue(null);
    const result: Record<string, unknown> = await buildProfile(REF);
    expect(result.catalog).toBeNull();
    expect(result.value_enabled).toBe(false);
  });
});

describe('publish_profile', () => {
  it('routes the unclaimed draft to the person via claim_url', async () => {
    const result: Record<string, unknown> = await publishProfile(REF);
    expect(result.status).toBe('claim_required');
    expect(result.claim_url).toBe(
      `https://jov.ie/claim/agent/${DRAFT_ID}?h=handoff`
    );
    expect(result.next_action).toBe('send_user_claim_url');
  });

  it('answers the publish step for a claimed draft without publishing', async () => {
    // Claimed drafts are invisible to the unclaimed-only mutation loader;
    // publish reads both states and still refuses to publish agent-side.
    state.draft = draftRow({ claimedAt: new Date() });
    const result: Record<string, unknown> = await publishProfile(REF);
    expect(result.status).toBe('claimed');
    expect(result.next_action).toBe('share_profile');
  });
});

describe('share_profile', () => {
  it('returns the public URL plus a factual share line', async () => {
    mocks.profileByUsername.mockResolvedValue({
      username: 'SignalArtist',
      usernameNormalized: 'signalartist',
      isPublic: true,
      displayName: 'Signal Artist',
    });
    mocks.creatorName.mockReturnValue('Signal Artist');
    const result: Record<string, unknown> = await shareProfile({
      username: 'signalartist',
    });
    expect(result.status).toBe('ok');
    expect(result.profile_url).toBe('https://jov.ie/signalartist');
    expect(result.share_text).toBe(
      'Signal Artist on Jovie: https://jov.ie/signalartist'
    );
  });

  it('never shares a private or excluded profile', async () => {
    mocks.profileByUsername.mockResolvedValue({ isPublic: false });
    const result: Record<string, unknown> = await shareProfile({
      username: 'ghost',
    });
    expect(result.status).toBe('not_public');
  });

  it('never shares a public profile the discovery policy excludes', async () => {
    mocks.profileByUsername.mockResolvedValue({
      username: 'tmoc0g1x9dwmk71',
      usernameNormalized: 'tmoc0g1x9dwmk71',
      isPublic: true,
      displayName: 'gp moc…+clerk test',
    });
    mocks.creatorName.mockReturnValue('gp moc…+clerk test');
    const result: Record<string, unknown> = await shareProfile({
      username: 'tmoc0g1x9dwmk71',
    });
    expect(result.status).toBe('not_public');
  });
});

describe('start_upgrade', () => {
  it('returns the existing claim/start checkout entry for a Spotify draft', async () => {
    const result: Record<string, unknown> = await startUpgrade(REF);
    expect(result.status).toBe('ok');
    expect(result.checkout_url).toBe(
      'https://jov.ie/claim/start?spotify=4Z8W4fKeB5YxbusR9QnbSa'
    );
  });

  it('falls back to the new-profile checkout entry without a Spotify id', async () => {
    mocks.loadDraft.mockImplementation(() =>
      Promise.resolve(
        draftRow({
          provider: 'apple_music',
          external_id: '12345',
          artist_id: 'apple_music:12345',
        })
      )
    );
    const result: Record<string, unknown> = await startUpgrade(REF);
    expect(result.checkout_url).toBe('https://jov.ie/claim/start?new=1');
  });
});
