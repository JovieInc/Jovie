import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const eqMock = vi.fn((left: unknown, right: unknown) => ({ left, right }));
  const andMock = vi.fn((...conditions: unknown[]) => conditions);
  const getCachedAuthMock = vi
    .fn()
    .mockResolvedValue({ userId: 'app-user-uuid' });
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const innerJoinMock = vi.fn(() => ({ where: whereMock }));
  const fromMock = vi.fn(() => ({ innerJoin: innerJoinMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));
  const setAllEnrichmentStatusesMock = vi.fn().mockResolvedValue(undefined);
  const getSpotifyArtistProfileMock = vi.fn().mockResolvedValue(null);
  const refreshFeaturedPlaylistFallbackCandidateMock = vi
    .fn()
    .mockResolvedValue(undefined);

  return {
    andMock,
    eqMock,
    getCachedAuthMock,
    getSpotifyArtistProfileMock,
    limitMock,
    refreshFeaturedPlaylistFallbackCandidateMock,
    selectMock,
    setAllEnrichmentStatusesMock,
    updateMock,
  };
});

vi.mock('drizzle-orm', () => ({
  and: hoisted.andMock,
  eq: hoisted.eqMock,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    clerkId: 'users.clerkId',
    id: 'users.id',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    appleMusicId: 'creatorProfiles.appleMusicId',
    appleMusicUrl: 'creatorProfiles.appleMusicUrl',
    avatarLockedByUser: 'creatorProfiles.avatarLockedByUser',
    avatarUrl: 'creatorProfiles.avatarUrl',
    bio: 'creatorProfiles.bio',
    deezerId: 'creatorProfiles.deezerId',
    displayName: 'creatorProfiles.displayName',
    displayNameLocked: 'creatorProfiles.displayNameLocked',
    genres: 'creatorProfiles.genres',
    id: 'creatorProfiles.id',
    isClaimed: 'creatorProfiles.isClaimed',
    soundcloudId: 'creatorProfiles.soundcloudId',
    spotifyFollowers: 'creatorProfiles.spotifyFollowers',
    spotifyId: 'creatorProfiles.spotifyId',
    spotifyPopularity: 'creatorProfiles.spotifyPopularity',
    spotifyUrl: 'creatorProfiles.spotifyUrl',
    theme: 'creatorProfiles.theme',
    tidalId: 'creatorProfiles.tidalId',
    userId: 'creatorProfiles.userId',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
    youtubeMusicId: 'creatorProfiles.youtubeMusicId',
    youtubeUrl: 'creatorProfiles.youtubeUrl',
  },
}));

vi.mock('@/lib/dsp-enrichment/enrichment-status', () => ({
  setAllEnrichmentStatuses: hoisted.setAllEnrichmentStatusesMock,
}));

vi.mock('@/lib/dsp-enrichment/musicfetch-mapping', () => ({
  extractMusicFetchLinks: vi.fn(() => []),
  mapMusicFetchProfileFields: vi.fn(() => ({})),
}));

vi.mock('@/lib/dsp-enrichment/providers/musicfetch', () => ({
  fetchArtistBySpotifyUrl: vi.fn(),
  isMusicFetchAvailable: vi.fn(() => false),
}));

vi.mock('@/lib/dsp-enrichment/providers/spotify', () => ({
  getBestSpotifyImageUrl: vi.fn(() => null),
  getSpotifyArtistProfile: hoisted.getSpotifyArtistProfileMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/ingestion/merge', () => ({
  normalizeAndMergeExtraction: vi.fn(),
}));

vi.mock('@/lib/profile/featured-playlist-fallback', () => ({
  refreshFeaturedPlaylistFallbackCandidate:
    hoisted.refreshFeaturedPlaylistFallbackCandidateMock,
}));

vi.mock('@/lib/profile/profile-theme.server', () => ({
  buildThemeWithProfileAccent: vi.fn(),
}));

vi.mock('@/lib/spotify/blacklist', () => ({
  isBlacklistedSpotifyId: vi.fn(() => false),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
  },
}));

vi.mock('@/app/onboarding/actions/avatar', () => ({
  uploadRemoteAvatar: vi.fn(),
}));

describe('enrichProfileFromDsp app-user identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({
      userId: 'app-user-uuid',
    });
    hoisted.limitMock.mockResolvedValue([
      {
        appleMusicId: null,
        appleMusicUrl: null,
        avatarLockedByUser: false,
        avatarUrl: 'https://cdn.example.com/avatar.avif',
        bio: null,
        deezerId: null,
        displayName: 'Artist Name',
        displayNameLocked: false,
        genres: null,
        id: 'profile-uuid',
        soundcloudId: null,
        spotifyFollowers: null,
        spotifyId: null,
        spotifyPopularity: null,
        spotifyUrl: null,
        theme: {},
        tidalId: null,
        username: 'artist',
        usernameNormalized: 'artist',
        youtubeMusicId: null,
        youtubeUrl: null,
      },
    ]);
  });

  it('loads the claimed profile by users.id instead of legacy clerk_id', async () => {
    const { enrichProfileFromDsp } = await import(
      '@/app/onboarding/actions/enrich-profile'
    );

    await expect(
      enrichProfileFromDsp(
        'spotify-artist-id',
        'https://open.spotify.com/artist/spotify-artist-id'
      )
    ).resolves.toMatchObject({
      imageUrl: 'https://cdn.example.com/avatar.avif',
      name: 'Artist Name',
    });

    expect(hoisted.eqMock).toHaveBeenCalledWith('users.id', 'app-user-uuid');
    expect(hoisted.eqMock).not.toHaveBeenCalledWith(
      'users.clerkId',
      'app-user-uuid'
    );
    expect(hoisted.setAllEnrichmentStatusesMock).toHaveBeenCalledWith(
      expect.anything(),
      'profile-uuid',
      'enriching'
    );
  });
});
