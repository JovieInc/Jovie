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
import {
  AGENT_DRAFT_CLAIM_SOURCE,
  claimAgentDraft,
  loadAgentClaimView,
} from './draft-claim.server';

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
const reserved = () =>
  mocks.updates.filter(
    update => (update as { claimedAt?: unknown }).claimedAt instanceof Date
  ).length;
const released = () =>
  mocks.updates.filter(
    update => (update as { claimedAt?: unknown }).claimedAt === null
  ).length;

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

describe('claimAgentDraft', () => {
  it('reserves the draft first, claims privately through finalize and persists attribution', async () => {
    const row = draftRow();
    // draft, prior profile, spotify profiles, tx owned, existing release, providers
    mocks.selects = [[row], [], [], [], [], [{ id: 'spotify' }]];
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalartist',
    });
    expect(reserved()).toBe(1);
    expect(released()).toBe(0);
    expect(mocks.markWaitlist).toHaveBeenCalledWith(fakeDb, 'user-1');
    expect(mocks.claim).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        userId: 'user-1',
        creatorProfileId: 'profile-1',
        source: AGENT_DRAFT_CLAIM_SOURCE,
        finalizeOnboarding: true,
        publish: false,
      })
    );
    expect(mocks.inserts[0]).toMatchObject({
      userId: 'user-1',
      isClaimed: false,
      isPublic: false,
      // Untrusted image host is dropped.
      avatarUrl: null,
      settings: {
        agentAcquisition: {
          draft_id: draftId,
          agent_source: 'mcp',
          client: 'chatgpt',
          installation_id: 'install-1',
        },
      },
    });
    expect(mocks.track.mock.calls.map(call => call[1])).toEqual([
      'claim_completed',
      'activation_achieved',
    ]);
    expect(mocks.upsertRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: 'profile-1',
        title: 'Signal Fire',
        slug: 'signal-fire',
        status: 'draft',
        artworkUrl: 'https://i.scdn.co/image/cover',
      })
    );
    expect(mocks.upsertLink).toHaveBeenCalledWith(
      expect.objectContaining({ releaseId: 'release-1', providerId: 'spotify' })
    );
  });

  it('drops artwork from hosts outside the provider image CDN allowlist', async () => {
    const row = draftRow();
    const launch = row.preview.launch.result.release;
    launch.artwork_url = 'https://tracker.example/pixel.png';
    mocks.selects = [[row], [], [], [], [], []];
    await claim(row);
    expect(mocks.upsertRelease).toHaveBeenCalledWith(
      expect.objectContaining({ artworkUrl: null })
    );
  });

  it('never overwrites an existing release with the same slug', async () => {
    const row = draftRow();
    mocks.selects = [[row], [], [], [], [{ id: 'release-existing' }]];
    await claim(row);
    expect(mocks.upsertRelease).not.toHaveBeenCalled();
  });

  it('blocks waitlisted users before any reservation or ownership work', async () => {
    const row = draftRow();
    mocks.gate.mockResolvedValue(true);
    mocks.selects = [[row], [], [], [{ userStatus: 'waitlist_pending' }]];
    expect(await claim(row)).toEqual({ status: 'waitlist_pending' });
    expect(reserved()).toBe(0);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('lets waitlist-cleared users claim while the gate is on', async () => {
    const row = draftRow();
    mocks.gate.mockResolvedValue(true);
    mocks.selects = [
      [row],
      [],
      [],
      [{ userStatus: 'waitlist_approved' }],
      [],
      [],
      [],
    ];
    expect(await claim(row)).toMatchObject({ status: 'claimed' });
  });

  it('maps the in-transaction waitlist guard to waitlist_pending and releases the reservation', async () => {
    const row = draftRow();
    mocks.selects = [[row], [], [], [], []];
    mocks.markWaitlist.mockRejectedValueOnce(
      new Error('Approved waitlist access is required to complete signup')
    );
    expect(await claim(row)).toEqual({ status: 'waitlist_pending' });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(released()).toBe(1);
  });

  it('fails closed on unknown or high reach and links nothing', async () => {
    for (const followers of [null, 250_000]) {
      const row = draftRow();
      mocks.selects = [[row], [], []];
      mocks.reach.mockResolvedValueOnce({ followers, name: null });
      expect(await claim(row)).toEqual({
        status: 'verification_required',
        spotifyId,
      });
    }
    expect(reserved()).toBe(0);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('refuses a claim when the draft differs from what was reviewed', async () => {
    const row = draftRow();
    mocks.selects = [[row], []];
    expect(await claim(row, 'user-1', 'x'.repeat(43))).toEqual({
      status: 'draft_changed',
    });
    // The stored preview changed between check and reservation.
    mocks.selects = [[row], [], [], [row]];
    mocks.consumed = [];
    expect(await claim(row)).toEqual({ status: 'draft_changed' });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('loses a concurrent reservation cleanly (single use)', async () => {
    const row = draftRow();
    mocks.selects = [[row], [], [], [{ ...row, claimedAt: new Date() }]];
    mocks.consumed = [];
    expect(await claim(row)).toEqual({ status: 'already_claimed' });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('releases the reservation on an identity conflict unless the user already won', async () => {
    const { SpotifyProfileIdentityConflictError } = await import(
      '@/lib/profile/spotify-profile-identity'
    );
    const row = draftRow();
    mocks.selects = [[row], [], [], [], []];
    mocks.assertIdentity.mockRejectedValueOnce(
      new SpotifyProfileIdentityConflictError()
    );
    expect(await claim(row)).toEqual({ status: 'artist_taken' });
    expect(released()).toBe(1);

    mocks.updates = [];
    const owner = { id: 'profile-1', userId: 'user-1', handle: 'signalartist' };
    mocks.selects = [[row], [], [], [], [owner], [], []];
    mocks.assertIdentity.mockRejectedValueOnce(
      new SpotifyProfileIdentityConflictError()
    );
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalartist',
    });
    expect(released()).toBe(0);
  });

  it('never claims for a different session user', async () => {
    const row = draftRow();
    mocks.selects = [[row], [], [], []];
    mocks.sessionUser = 'someone-else';
    await expect(claim(row)).rejects.toThrow('Session mismatch');
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(released()).toBe(1);
  });

  it('rejects an invalid or tampered handoff before any ownership work', async () => {
    const row = draftRow();
    mocks.selects = [[row]];
    expect(
      await claimAgentDraft(draftId, 'x'.repeat(43), 'user-1', digestOf(row))
    ).toEqual({ status: 'invalid' });
    expect(await claimAgentDraft('not-a-uuid', 'x', 'user-1', 'x')).toEqual({
      status: 'invalid',
    });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('reports expiry', async () => {
    const row = draftRow({ expiresAt: new Date(Date.now() - 1000) });
    mocks.selects = [[row]];
    expect(await claim(row)).toEqual({ status: 'expired' });
  });

  it('is idempotent for the owner, using the reviewed row, and rejects anyone else', async () => {
    const row = draftRow({ claimedAt: new Date() });
    const owner = { id: 'profile-1', userId: 'user-1', handle: 'signalartist' };
    mocks.selects = [[row], [owner], [], []];
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalartist',
    });
    expect(mocks.upsertRelease).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { agentDraftId: draftId } })
    );
    mocks.selects = [[row], [owner]];
    expect(await claim(row, 'user-2')).toEqual({ status: 'already_claimed' });
  });

  it('routes existing profiles to their existing claim flows', async () => {
    const row = draftRow();
    mocks.selects = [
      [row],
      [],
      [{ handle: 'prebuilt', userId: null, isClaimed: false }],
    ];
    expect(await claim(row)).toEqual({
      status: 'existing_profile',
      handle: 'prebuilt',
    });
    mocks.selects = [
      [row],
      [],
      [{ handle: 'owned', userId: 'user-9', isClaimed: true }],
    ];
    expect(await claim(row)).toEqual({ status: 'artist_taken' });
  });

  it('does not self-serve claim non-Spotify or blocked artists', async () => {
    const apple = draftRow({
      preview: { ...draftRow().preview, provider: 'apple_music' },
    });
    mocks.selects = [[apple], []];
    expect(await claim(apple)).toEqual({ status: 'unsupported_provider' });
    const row = draftRow();
    mocks.selects = [[row], []];
    mocks.blacklisted.mockReturnValue(true);
    expect(await claim(row)).toEqual({ status: 'blocked_artist' });
  });

  it('keeps the reservation and reports claimed when the transaction committed but the call threw', async () => {
    const row = draftRow();
    const owner = { id: 'profile-1', userId: 'user-1', handle: 'signalartist' };
    // draft, prior, spotify, tx owned, committed lookup, existing release, providers
    mocks.selects = [[row], [], [], [], [owner], [], []];
    mocks.track.mockRejectedValueOnce(
      new Error('connection reset after commit')
    );
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalartist',
    });
    expect(released()).toBe(0);
    expect(mocks.upsertRelease).toHaveBeenCalledWith(
      expect.objectContaining({ creatorProfileId: 'profile-1' })
    );
  });

  it('keeps the reservation when the committed-profile lookup itself fails', async () => {
    const row = draftRow();
    mocks.selects = [[row], [], [], []];
    const transient = new Error('db down');
    mocks.track.mockRejectedValueOnce(transient);
    const realSelect = fakeDb.select;
    let calls = 0;
    fakeDb.select = () => {
      calls += 1;
      if (calls === 5) throw new Error('lookup failed');
      return realSelect();
    };
    try {
      await expect(claim(row)).rejects.toBe(transient);
    } finally {
      fakeDb.select = realSelect;
    }
    expect(released()).toBe(0);
  });

  it('finishes for the owner when a committed profile exists but the reservation was lost', async () => {
    const row = draftRow();
    const owner = { id: 'profile-1', userId: 'user-1', handle: 'signalartist' };
    mocks.selects = [[row], [owner], [], []];
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalartist',
    });
    expect(reserved()).toBe(1);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('takes over a stale reservation that has no profile', async () => {
    const row = draftRow({ claimedAt: new Date(Date.now() - 10 * 60 * 1000) });
    mocks.selects = [[row], [], [], [], [], []];
    expect(await claim(row)).toEqual({
      status: 'claimed',
      handle: 'signalartist',
    });
    expect(reserved()).toBe(1);
    expect(mocks.claim).toHaveBeenCalledOnce();
  });

  it('does not take over a fresh in-flight reservation', async () => {
    const row = draftRow({ claimedAt: new Date(Date.now() - 60 * 1000) });
    mocks.selects = [[row], []];
    expect(await claim(row)).toEqual({ status: 'already_claimed' });
    expect(reserved()).toBe(0);
  });

  it('loses a stale takeover race to another taker', async () => {
    const row = draftRow({ claimedAt: new Date(Date.now() - 10 * 60 * 1000) });
    mocks.selects = [[row], [], [], [{ ...row, claimedAt: new Date() }]];
    mocks.consumed = [];
    expect(await claim(row)).toEqual({ status: 'already_claimed' });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('stops when the viewer already owns a profile', async () => {
    const row = draftRow();
    mocks.selects = [[row], [], [], [{ handle: 'mine' }], []];
    expect(await claim(row)).toEqual({ status: 'has_profile', handle: 'mine' });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(released()).toBe(1);
  });
});

describe('loadAgentClaimView', () => {
  it('discloses nothing without a valid handoff', async () => {
    mocks.selects = [[draftRow()]];
    expect(await loadAgentClaimView(draftId, 'bad', null)).toEqual({
      state: 'invalid',
    });
  });

  it('shows the reviewed preview with only allowlisted images and its digest', async () => {
    const row = draftRow();
    mocks.selects = [[row]];
    const view = await loadAgentClaimView(draftId, handoffFor(row), null);
    expect(view).toMatchObject({
      state: 'ready',
      preview: {
        artistName: 'Signal Artist',
        imageUrl: null,
        digest: digestOf(row),
        release: {
          title: 'Signal Fire',
          artworkUrl: 'https://i.scdn.co/image/cover',
          links: { spotify: 'https://open.spotify.com/track/x' },
        },
      },
    });
    expect(JSON.stringify(view)).not.toContain(row.capabilityHash);
  });

  it('offers the claim again for a stale reservation with no profile', async () => {
    const stale = draftRow({
      claimedAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    mocks.selects = [[stale], []];
    expect(
      await loadAgentClaimView(draftId, handoffFor(stale), 'user-1')
    ).toMatchObject({ state: 'ready' });
    const fresh = draftRow({ claimedAt: new Date(Date.now() - 60 * 1000) });
    mocks.selects = [[fresh], []];
    expect(
      await loadAgentClaimView(draftId, handoffFor(fresh), 'user-1')
    ).toMatchObject({ state: 'claimed', ownedByViewer: false });
  });

  it('shows claimed state with ownership only for the owner', async () => {
    const row = draftRow({ claimedAt: new Date() });
    const owner = { id: 'p', userId: 'user-1', handle: 'signalartist' };
    mocks.selects = [[row], [owner]];
    expect(
      await loadAgentClaimView(draftId, handoffFor(row), 'user-1')
    ).toEqual({
      state: 'claimed',
      ownedByViewer: true,
      handle: 'signalartist',
    });
    mocks.selects = [[row], [owner]];
    expect(await loadAgentClaimView(draftId, handoffFor(row), null)).toEqual({
      state: 'claimed',
      ownedByViewer: false,
      handle: null,
    });
  });
});
