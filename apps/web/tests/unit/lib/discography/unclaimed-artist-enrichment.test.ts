import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const profileRows: unknown[] = [];
  const dbExecute = vi.fn(async () => undefined);
  const tx = {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };
  return {
    dbExecute,
    dbSelectResults: [] as unknown[][],
    enrichJobStatus: vi.fn(async () => undefined),
    fetchArtistBySpotifyUrl: vi.fn(),
    isMusicFetchAvailable: vi.fn(() => true),
    mergeExtraction: vi.fn(async () => ({ inserted: 0, updated: 0 })),
    profileRows,
    storeRawIdentityLinks: vi.fn(async () => 0),
    tx,
    withSystemIngestionSession: vi.fn(
      async (operation: (t: unknown) => Promise<unknown>) => operation(tx)
    ),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      for (const m of ['from', 'where', 'innerJoin']) {
        builder[m] = vi.fn(() => builder);
      }
      builder.limit = vi
        .fn()
        .mockImplementation(async () => hoisted.dbSelectResults.shift() ?? []);
      builder.then = (
        resolve: (v: unknown[]) => unknown,
        reject: (e: unknown) => unknown
      ) =>
        Promise.resolve(hoisted.dbSelectResults.shift() ?? []).then(
          resolve,
          reject
        );
      return builder;
    }),
    execute: hoisted.dbExecute,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    isClaimed: 'creatorProfiles.isClaimed',
    settings: 'creatorProfiles.settings',
  },
}));

vi.mock('@/lib/dsp-enrichment/enrichment-status', () => ({
  setEnrichmentJobStatus: hoisted.enrichJobStatus,
}));

vi.mock('@/lib/dsp-enrichment/musicfetch-mapping', () => ({
  extractAllMusicFetchServices: vi.fn(
    (artistData: { services: Record<string, { link?: string }> }) =>
      Object.values(artistData.services ?? {})
        .filter(s => s?.link)
        .map(s => ({ platform: 'x', url: s!.link }))
  ),
  mapMusicFetchProfileFields: vi.fn(() => ({})),
}));

vi.mock('@/lib/dsp-enrichment/providers/musicfetch', () => ({
  fetchArtistBySpotifyUrl: hoisted.fetchArtistBySpotifyUrl,
  isMusicFetchAvailable: hoisted.isMusicFetchAvailable,
}));

vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@/lib/identity/store', () => ({
  storeRawIdentityLinks: hoisted.storeRawIdentityLinks,
}));
vi.mock('@/lib/ingestion/merge', () => ({
  normalizeAndMergeExtraction: hoisted.mergeExtraction,
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: hoisted.withSystemIngestionSession,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

const { enrichUnclaimedArtistProfileIdentity, lookupUnclaimedArtistIdentity } =
  await import('@/lib/discography/unclaimed-artist-enrichment');

const baseProfile = {
  id: 'profile-1',
  isClaimed: false,
  settings: {},
  usernameNormalized: 'feddelegrand',
  displayName: 'Fedde Le Grand',
  displayNameLocked: false,
  avatarUrl: null,
  avatarLockedByUser: false,
  bio: null,
  spotifyUrl: 'https://open.spotify.com/artist/fedde',
  spotifyId: 'fedde',
  appleMusicUrl: null,
  appleMusicId: null,
  youtubeUrl: null,
  youtubeMusicId: null,
  deezerId: null,
  tidalId: null,
  soundcloudId: null,
};

const input = {
  profileId: 'profile-1',
  spotifyId: 'fedde',
  spotifyUrl: 'https://open.spotify.com/artist/fedde',
};

const musicFetchArtist = {
  type: 'artist' as const,
  name: 'Fedde Le Grand',
  services: {
    spotify: { link: 'https://open.spotify.com/artist/fedde' },
    instagram: { link: 'https://instagram.com/feddelegrand' },
    appleMusic: {
      link: 'https://music.apple.com/us/artist/fedde-le-grand/1',
    },
  },
};

describe('enrichUnclaimedArtistProfileIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dbSelectResults.length = 0;
    hoisted.isMusicFetchAvailable.mockReturnValue(true);
    hoisted.fetchArtistBySpotifyUrl.mockResolvedValue(musicFetchArtist);
  });

  it('never runs enrichment on a claimed profile', async () => {
    hoisted.dbSelectResults.push([{ ...baseProfile, isClaimed: true }]);

    const result = await enrichUnclaimedArtistProfileIdentity(input);

    expect(result).toBeNull();
    expect(hoisted.storeRawIdentityLinks).not.toHaveBeenCalled();
    expect(hoisted.mergeExtraction).not.toHaveBeenCalled();
  });

  it('stores raw evidence, publishes verified links, and writes a verified receipt', async () => {
    hoisted.dbSelectResults.push([baseProfile]);

    const result = await enrichUnclaimedArtistProfileIdentity(input);

    expect(result).toBe('verified');
    expect(hoisted.storeRawIdentityLinks).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      'musicfetch',
      input.spotifyUrl,
      expect.any(Array)
    );
    const [, , extraction] = hoisted.mergeExtraction.mock.calls[0] ?? [];
    expect(extraction.links.map((l: { url: string }) => l.url)).toEqual(
      expect.arrayContaining([
        'https://instagram.com/feddelegrand',
        expect.stringContaining('open.spotify.com'),
      ])
    );
    expect(
      extraction.links.every((l: { evidence?: { signals?: string[] } }) =>
        l.evidence?.signals?.includes('musicfetch_artist_lookup')
      )
    ).toBe(true);
    // The share-readiness receipt is persisted via an atomic jsonb_set.
    expect(hoisted.dbExecute).toHaveBeenCalled();
    expect(hoisted.enrichJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      'musicfetch',
      'complete'
    );
  });

  it('is idempotent: a terminal receipt short-circuits repeat passes', async () => {
    hoisted.dbSelectResults.push([
      {
        ...baseProfile,
        settings: {
          unclaimedArtistIdentityEnrichment: {
            status: 'verified',
            observedAt: '2026-09-26T00:00:00.000Z',
            sources: ['musicfetch'],
            provider: 'spotify',
            providerArtistId: 'fedde',
            verifiedPlatforms: ['spotify', 'instagram'],
            conflicts: [],
            linksFound: 2,
            shareReady: true,
          },
        },
      },
    ]);

    const result = await enrichUnclaimedArtistProfileIdentity(input);

    expect(result).toBe('verified');
    expect(hoisted.fetchArtistBySpotifyUrl).not.toHaveBeenCalled();
    expect(hoisted.storeRawIdentityLinks).not.toHaveBeenCalled();
  });

  it('records not_found when the source ran but returned nothing', async () => {
    hoisted.dbSelectResults.push([baseProfile]);
    hoisted.fetchArtistBySpotifyUrl.mockResolvedValue(null);

    const result = await enrichUnclaimedArtistProfileIdentity(input);

    expect(result).toBe('not_found');
    expect(hoisted.mergeExtraction).not.toHaveBeenCalled();
  });

  it('records not_checked when the lookup source is unavailable', async () => {
    hoisted.dbSelectResults.push([baseProfile]);
    hoisted.isMusicFetchAvailable.mockReturnValue(false);

    const result = await enrichUnclaimedArtistProfileIdentity({
      ...input,
      lookup: { attempted: false, artistData: null },
    });

    expect(result).toBe('not_checked');
    expect(hoisted.fetchArtistBySpotifyUrl).not.toHaveBeenCalled();
  });
});

describe('lookupUnclaimedArtistIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.isMusicFetchAvailable.mockReturnValue(true);
  });

  it('reports attempted=false when the source is not configured', async () => {
    hoisted.isMusicFetchAvailable.mockReturnValue(false);
    const result = await lookupUnclaimedArtistIdentity(
      'https://open.spotify.com/artist/fedde'
    );
    expect(result).toEqual({ attempted: false, artistData: null });
  });

  it('returns the artist payload on success and fails soft on errors', async () => {
    hoisted.fetchArtistBySpotifyUrl.mockResolvedValue(musicFetchArtist);
    expect(
      await lookupUnclaimedArtistIdentity(
        'https://open.spotify.com/artist/fedde'
      )
    ).toEqual({ attempted: true, artistData: musicFetchArtist });

    hoisted.fetchArtistBySpotifyUrl.mockRejectedValue(new Error('boom'));
    expect(
      await lookupUnclaimedArtistIdentity(
        'https://open.spotify.com/artist/fedde'
      )
    ).toEqual({ attempted: false, artistData: null });
  });
});
