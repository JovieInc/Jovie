import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isProofBlockingPublication,
  readClaimVerification,
} from '@/lib/claim/claim-verification';

const config = vi.hoisted(() => ({
  URL_ENCRYPTION_KEY: 'claim-proof-test-key-only',
}));
const mocks = vi.hoisted(() => ({
  selects: [] as unknown[][],
  inserts: [] as unknown[],
  updates: [] as unknown[],
  consumed: [{ id: 'draft' }] as unknown[],
  claim: vi.fn(),
  assertIdentity: vi.fn(),
  reach: vi.fn(),
  scheduleCard: vi.fn(),
  blacklisted: vi.fn(),
  handle: vi.fn(),
  track: vi.fn(),
  upsertRelease: vi.fn(),
  upsertLink: vi.fn(),
  capture: vi.fn(),
  sessionUser: 'user-1',
  gate: vi.fn(),
  markWaitlist: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({ env: config }));

const fakeDb = vi.hoisted(() => {
  function chain(
    resolveValue: () => unknown,
    onSet?: (value: unknown) => void
  ) {
    const target: Record<string, unknown> = {};
    const self = new Proxy(target, {
      get(_t, prop) {
        if (prop === 'then') {
          const value = resolveValue();
          return (resolve: (v: unknown) => void) => resolve(value);
        }
        if (prop === 'returning')
          return () => ({
            then: (resolve: (v: unknown) => void) => resolve(resolveValue()),
          });
        if (prop === 'values' || prop === 'set')
          return (value: unknown) => {
            onSet?.(value);
            return self;
          };
        return () => self;
      },
    });
    return self;
  }
  return {
    select: () => chain(() => mocks.selects.shift() ?? []),
    insert: () =>
      chain(
        () => [{ id: 'profile-1' }],
        value => mocks.inserts.push(value)
      ),
    update: () =>
      chain(
        () => mocks.consumed,
        value => mocks.updates.push(value)
      ),
  };
});

vi.mock('@/lib/db', () => ({ db: fakeDb }));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: (op: (tx: unknown, userId: string) => unknown) =>
    op(fakeDb, mocks.sessionUser),
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: vi.fn(),
}));
vi.mock('@/lib/cache/profile', () => ({ invalidateProfileCache: vi.fn() }));
vi.mock('@/lib/cache/releases', () => ({ invalidateReleaseCaches: vi.fn() }));
vi.mock('@/lib/claim/claim-verification.server', () => ({
  lookupArtistReach: mocks.reach,
  scheduleClaimVerificationCard: mocks.scheduleCard,
}));
vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mocks.gate,
}));
vi.mock('@/lib/waitlist/signup', () => ({
  markWaitlistSignedUpInTx: mocks.markWaitlist,
}));
vi.mock('@/lib/claim/finalize', () => ({
  claimPrebuiltProfileForUser: mocks.claim,
}));
vi.mock('@/lib/discography/queries', () => ({
  upsertRelease: mocks.upsertRelease,
  upsertProviderLink: mocks.upsertLink,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/ingestion/flows/profile-operations', () => ({
  findAvailableHandle: mocks.handle,
}));
vi.mock('@/lib/profile/spotify-profile-identity', () => ({
  assertSpotifyProfileIdentityAvailable: mocks.assertIdentity,
  SpotifyProfileIdentityConflictError: class extends Error {},
}));
vi.mock('@/lib/server-analytics', () => ({ trackServerEventTx: mocks.track }));
vi.mock('@/lib/spotify/blacklist', () => ({
  isBlacklistedSpotifyId: mocks.blacklisted,
}));

import {
  agentDraftPreviewDigest,
  mintAgentClaimHandoff,
} from './claim-handoff';
import { claimAgentDraft } from './draft-claim.server';

const draftId = '9efebd98-39b7-4a77-8965-04b5aafad9ad';
const spotifyId = '4Z8W4fKeB5YxbusRsdQVPb';

function draftRow() {
  return {
    id: draftId,
    artistId: `spotify:${spotifyId}`,
    capabilityHash: 'c'.repeat(64),
    preview: {
      artist_id: `spotify:${spotifyId}`,
      provider: 'spotify',
      external_id: spotifyId,
      display_name: 'Signal Artist',
      source_url: `https://open.spotify.com/artist/${spotifyId}`,
      image_url: null,
      bio: null,
      genres: [],
    },
    acquisition: {
      agent_source: 'mcp',
      client: 'chatgpt',
      installation_id: 'install-1',
      first_touch: {},
    },
    expiresAt: new Date(Date.now() + 86_400_000),
    claimedAt: null,
    createdAt: new Date(),
  };
}

describe('claimAgentDraft — proofOnly enforcement and reserved handle privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selects = [];
    mocks.inserts = [];
    mocks.updates = [];
    mocks.consumed = [{ id: draftId }];
    mocks.sessionUser = 'user-1';
    mocks.reach.mockResolvedValue({ followers: 1_200, name: 'Signal Artist' });
    mocks.gate.mockResolvedValue(false);
    mocks.blacklisted.mockReturnValue(false);
    mocks.handle.mockResolvedValue('signalartist');
    mocks.track.mockResolvedValue({ ok: true });
    mocks.upsertRelease.mockResolvedValue({ id: 'release-1' });
  });

  it('writes proofOnly claimVerification in the same Spotify attach update and schedules operator review', async () => {
    const row = draftRow();
    mocks.selects = [[row], [], [], []];

    const result = await claimAgentDraft(
      draftId,
      mintAgentClaimHandoff(row as never),
      'user-1',
      agentDraftPreviewDigest(row.preview)
    );

    expect(result).toEqual({ status: 'claimed', handle: 'signalartist' });

    const spotifyUpdate = mocks.updates.find(
      update => (update as { spotifyId?: string }).spotifyId === spotifyId
    ) as { settings?: Record<string, unknown> } | undefined;

    expect(spotifyUpdate?.settings).toBeDefined();
    expect(isProofBlockingPublication(spotifyUpdate?.settings)).toBe(true);
    expect(readClaimVerification(spotifyUpdate?.settings)).toMatchObject({
      spotifyArtistId: spotifyId,
      status: 'pending_verification',
      proofOnly: true,
      proofCode: expect.stringMatching(/^jovie-/),
    });
    expect(mocks.scheduleCard).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        handle: 'signalartist',
      })
    );
  });

  it('returns artist_taken instead of leaking another user waitlist-reserved unclaimed handle', async () => {
    const row = draftRow();
    mocks.selects = [
      [row],
      [],
      [{ handle: 'secretreserved', userId: 'other-user', isClaimed: false }],
    ];

    const result = await claimAgentDraft(
      draftId,
      mintAgentClaimHandoff(row as never),
      'user-1',
      agentDraftPreviewDigest(row.preview)
    );

    expect(result).toEqual({ status: 'artist_taken' });
  });
});
