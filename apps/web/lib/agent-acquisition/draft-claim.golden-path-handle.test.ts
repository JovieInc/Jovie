import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  URL_ENCRYPTION_KEY: 'claim-test-key-only',
}));
const mocks = vi.hoisted(() => ({
  selects: [] as unknown[][],
  inserts: [] as unknown[],
  updates: [] as unknown[],
  consumed: [{ id: 'draft' }] as unknown[],
  claim: vi.fn(),
  assertIdentity: vi.fn(),
  reach: vi.fn(),
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
function draftRow(overrides: Record<string, unknown> = {}) {
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
      image_url: 'https://evil.example/artist.png',
      bio: null,
      genres: [],
      launch: {
        inputFingerprint: 'private',
        result: {
          release: {
            content_type: 'track',
            title: 'Signal Fire',
            artist_name: 'Signal Artist',
            release_date: '2026-11-07',
            artwork_url: 'https://i.scdn.co/image/cover',
            upc: null,
            dsp_links: {},
          },
          smart_link: {
            links: { spotify: 'https://open.spotify.com/track/x' },
          },
        },
      },
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
    ...overrides,
  };
}
type Row = ReturnType<typeof draftRow>;
const handoffFor = (row: Row) => mintAgentClaimHandoff(row as never);
const digestOf = (row: Row) => agentDraftPreviewDigest(row.preview);
const claim = (row: Row, userId = 'user-1', digest = digestOf(row)) =>
  claimAgentDraft(draftId, handoffFor(row), userId, digest);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selects = [];
  mocks.inserts = [];
  mocks.updates = [];
  mocks.consumed = [{ id: draftId }];
  mocks.sessionUser = 'user-1';
  mocks.reach.mockResolvedValue({ followers: 1200, name: 'Signal Artist' });
  mocks.gate.mockResolvedValue(false);
  mocks.blacklisted.mockReturnValue(false);
  mocks.handle.mockResolvedValue('signalartist');
  mocks.track.mockResolvedValue({ ok: true });
  mocks.upsertRelease.mockResolvedValue({ id: 'release-1' });
});

describe('claimAgentDraft golden-path handle', () => {
  it('honors an availability-checked golden-path handle request when still free', async () => {
    const base = draftRow();
    const row = draftRow({
      preview: { ...base.preview, golden_path: { handle: 'signalandartist' } },
    });
    // draft, prior profile, spotify profiles, tx owned, existing release, providers
    mocks.selects = [[row], [], [], [], [], [{ id: 'spotify' }]];
    mocks.handle.mockResolvedValue('signalandartist');
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalandartist',
    });
    expect(mocks.handle).toHaveBeenCalledWith(
      expect.anything(),
      'signalandartist'
    );
  });

  it('falls back to the derived handle when the requested one is taken since check', async () => {
    const base = draftRow();
    const row = draftRow({
      preview: { ...base.preview, golden_path: { handle: 'signalandartist' } },
    });
    mocks.selects = [[row], [], [], [], [], [{ id: 'spotify' }]];
    // findAvailableHandle can only return the base or a suffixed variant;
    // anything but the exact requested handle is a silent swap -> derived.
    mocks.handle
      .mockResolvedValueOnce('signalandartist1')
      .mockResolvedValueOnce('signalartist');
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalartist',
    });
  });
});
