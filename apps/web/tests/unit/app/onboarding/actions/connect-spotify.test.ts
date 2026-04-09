import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const updateSetArgs: Array<Record<string, unknown>> = [];
  const syncReleasesFromSpotifyMock = vi.fn();
  const processDspArtistDiscoveryJobStandaloneMock = vi
    .fn()
    .mockResolvedValue(undefined);
  const processMusicFetchEnrichmentJobMock = vi
    .fn()
    .mockResolvedValue(undefined);
  const captureErrorMock = vi.fn();
  const getCachedAuthMock = vi.fn().mockResolvedValue({ userId: 'clerk_123' });
  const trackServerEventMock = vi.fn();
  const revalidatePathMock = vi.fn();
  const revalidateTagMock = vi.fn();
  const noStoreMock = vi.fn();
  const isBlacklistedSpotifyIdMock = vi.fn().mockReturnValue(false);

  const selectMock = vi.fn(() => {
    const result = selectResults.shift() ?? [];
    const limitMock = vi.fn().mockResolvedValue(result);
    const whereMock = vi.fn(() => ({ limit: limitMock }));
    const fromMock = vi.fn(() => ({
      innerJoin: vi.fn(() => ({ where: whereMock })),
      where: whereMock,
    }));

    return { from: fromMock };
  });

  const updateMock = vi.fn(() => ({
    set: vi.fn((args: Record<string, unknown>) => {
      updateSetArgs.push(args);
      return {
        where: vi.fn().mockResolvedValue(undefined),
      };
    }),
  }));

  return {
    captureErrorMock,
    getCachedAuthMock,
    isBlacklistedSpotifyIdMock,
    noStoreMock,
    processDspArtistDiscoveryJobStandaloneMock,
    processMusicFetchEnrichmentJobMock,
    revalidatePathMock,
    revalidateTagMock,
    selectMock,
    selectResults,
    syncReleasesFromSpotifyMock,
    trackServerEventMock,
    updateMock,
    updateSetArgs,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePathMock,
  revalidateTag: hoisted.revalidateTagMock,
  unstable_noStore: hoisted.noStoreMock,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  ne: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/errors', () => ({
  isUniqueViolation: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    clerkId: 'clerkId',
    id: 'id',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    isClaimed: 'isClaimed',
    settings: 'settings',
    spotifyId: 'spotifyId',
    spotifyUrl: 'spotifyUrl',
    updatedAt: 'updatedAt',
    userId: 'userId',
    usernameNormalized: 'usernameNormalized',
  },
}));

vi.mock('@/lib/discography/spotify-import', () => ({
  syncReleasesFromSpotify: hoisted.syncReleasesFromSpotifyMock,
}));

vi.mock('@/lib/dsp-enrichment/jobs', () => ({
  processDspArtistDiscoveryJobStandalone:
    hoisted.processDspArtistDiscoveryJobStandaloneMock,
  processMusicFetchEnrichmentJob: hoisted.processMusicFetchEnrichmentJobMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: hoisted.trackServerEventMock,
}));

vi.mock('@/lib/cache/tags', () => ({
  createSmartLinkContentTag: vi.fn().mockReturnValue('smart-link-tag'),
}));

vi.mock('@/lib/spotify/blacklist', () => ({
  isBlacklistedSpotifyId: hoisted.isBlacklistedSpotifyIdMock,
}));

function queueOwnedProfile(settings: Record<string, unknown> = {}) {
  hoisted.selectResults.push([
    {
      handle: 'artist',
      id: 'profile_123',
      settings,
    },
  ]);
}

function queueNoExistingClaim() {
  hoisted.selectResults.push([]);
}

function queueLatestSettings(settings: Record<string, unknown> = {}) {
  hoisted.selectResults.push([{ settings }]);
}

describe('connectOnboardingSpotifyArtist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.selectResults.length = 0;
    hoisted.updateSetArgs.length = 0;
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_123' });
    hoisted.isBlacklistedSpotifyIdMock.mockReturnValue(false);
  });

  it('waits for inline import and enrichment before succeeding', async () => {
    queueOwnedProfile({ existing: 'value' });
    queueNoExistingClaim();
    queueLatestSettings({ spotifyImportStatus: 'importing' });

    hoisted.syncReleasesFromSpotifyMock.mockResolvedValue({
      imported: 3,
      releases: [{ id: 'release_1' }],
      success: true,
      total: 3,
    });

    const { connectOnboardingSpotifyArtist } = await import(
      '@/app/onboarding/actions/connect-spotify'
    );

    const result = await connectOnboardingSpotifyArtist({
      artistName: 'Artist Name',
      profileId: 'profile_123',
      spotifyArtistId: 'artist_spotify_id',
      spotifyArtistUrl: 'https://open.spotify.com/artist/artist_spotify_id',
    });

    expect(result).toMatchObject({
      artistName: 'Artist Name',
      imported: 3,
      importing: false,
      success: true,
    });
    expect(hoisted.syncReleasesFromSpotifyMock).toHaveBeenCalledWith(
      'profile_123',
      { includeTracks: true }
    );
    expect(
      hoisted.processDspArtistDiscoveryJobStandaloneMock
    ).toHaveBeenCalledOnce();
    expect(hoisted.processMusicFetchEnrichmentJobMock).toHaveBeenCalledOnce();
    expect(hoisted.updateSetArgs[1]).toMatchObject({
      settings: expect.objectContaining({
        spotifyArtistName: 'Artist Name',
        spotifyImportStatus: 'complete',
        spotifyImportTotal: 3,
      }),
    });
  });

  it('fails closed when Spotify import completes without releases', async () => {
    queueOwnedProfile();
    queueNoExistingClaim();
    queueLatestSettings({ spotifyImportStatus: 'importing' });

    hoisted.syncReleasesFromSpotifyMock.mockResolvedValue({
      imported: 0,
      releases: [],
      success: false,
      total: 0,
    });

    const { connectOnboardingSpotifyArtist } = await import(
      '@/app/onboarding/actions/connect-spotify'
    );

    const result = await connectOnboardingSpotifyArtist({
      artistName: 'Artist Name',
      profileId: 'profile_123',
      spotifyArtistId: 'artist_spotify_id',
      spotifyArtistUrl: 'https://open.spotify.com/artist/artist_spotify_id',
    });

    expect(result).toMatchObject({
      imported: 0,
      importing: false,
      message: 'Spotify import finished with errors.',
      success: false,
    });
    expect(
      hoisted.processDspArtistDiscoveryJobStandaloneMock
    ).not.toHaveBeenCalled();
    expect(hoisted.processMusicFetchEnrichmentJobMock).not.toHaveBeenCalled();
    expect(hoisted.updateSetArgs[1]).toMatchObject({
      settings: expect.objectContaining({
        spotifyImportStatus: 'failed',
        spotifyImportTotal: 0,
      }),
    });
  });

  it('marks the profile failed when Spotify import throws', async () => {
    queueOwnedProfile({ existing: 'value' });
    queueNoExistingClaim();
    queueLatestSettings({ existing: 'value' });

    hoisted.syncReleasesFromSpotifyMock.mockRejectedValue(new Error('boom'));

    const { connectOnboardingSpotifyArtist } = await import(
      '@/app/onboarding/actions/connect-spotify'
    );

    const result = await connectOnboardingSpotifyArtist({
      artistName: 'Artist Name',
      profileId: 'profile_123',
      spotifyArtistId: 'artist_spotify_id',
      spotifyArtistUrl: 'https://open.spotify.com/artist/artist_spotify_id',
    });

    expect(result).toMatchObject({
      imported: 0,
      importing: false,
      message: 'Spotify import failed.',
      success: false,
    });
    expect(hoisted.updateSetArgs[1]).toMatchObject({
      settings: expect.objectContaining({
        existing: 'value',
        spotifyImportStatus: 'failed',
      }),
    });
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Spotify import failed during onboarding connect',
      expect.any(Error),
      expect.objectContaining({
        action: 'connectOnboardingSpotifyArtist',
        creatorProfileId: 'profile_123',
      })
    );
  });
});
