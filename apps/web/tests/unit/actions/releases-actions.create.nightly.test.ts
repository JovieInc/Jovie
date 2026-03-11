import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks -- must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------
const {
  mockGetCachedAuth,
  mockGetDashboardData,
  mockRedirect,
  mockRevalidateTag,
  mockRevalidatePath,
  mockSyncReleasesFromSpotify,
  mockEnqueueDspArtistDiscoveryJob,
  mockEnqueueMusicFetchEnrichmentJob,
  mockGetReleasesForProfile,
  mockThrowIfRedirect,
  mockDbSelect,
  mockDbUpdate,
  mockCaptureError,
  mockTrackServerEvent,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockRedirect: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockSyncReleasesFromSpotify: vi.fn(),
  mockEnqueueDspArtistDiscoveryJob: vi.fn(),
  mockEnqueueMusicFetchEnrichmentJob: vi.fn(),
  mockGetReleasesForProfile: vi.fn(),
  mockThrowIfRedirect: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockCaptureError: vi.fn(),
  mockTrackServerEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: mockGetDashboardData,
}));

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  unstable_cache: vi.fn((fn: Function) => fn),
  revalidateTag: mockRevalidateTag,
  revalidatePath: mockRevalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', settings: 'settings', spotifyId: 'spotifyId' },
}));

vi.mock('@/lib/discography/config', () => ({
  PRIMARY_PROVIDER_KEYS: ['spotify', 'apple_music'],
  PROVIDER_CONFIG: {
    spotify: { label: 'Spotify' },
    apple_music: { label: 'Apple Music' },
    youtube_music: { label: 'YouTube Music' },
  },
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleaseById: vi.fn(),
  getReleasesForProfile: mockGetReleasesForProfile,
  getTracksForReleaseWithProviders: vi.fn(),
  upsertProviderLink: vi.fn(),
  resetProviderLink: vi.fn(),
  getProviderLink: vi.fn(),
}));

vi.mock('@/lib/discography/spotify-import', () => ({
  syncReleasesFromSpotify: mockSyncReleasesFromSpotify,
}));

vi.mock('@/lib/discography/types', () => ({}));

vi.mock('@/lib/discography/utils', () => ({
  buildSmartLinkPath: vi.fn(
    (handle: string, slug: string, provider?: string) =>
      `/${handle}/${slug}${provider ? `/${provider}` : ''}`
  ),
}));

vi.mock('@/lib/discography/video-providers', () => ({
  VIDEO_PROVIDER_KEYS: ['youtube'],
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueDspArtistDiscoveryJob: mockEnqueueDspArtistDiscoveryJob,
  enqueueDspTrackEnrichmentJob: vi.fn(),
  enqueueMusicFetchEnrichmentJob: mockEnqueueMusicFetchEnrichmentJob,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock('@/lib/utils/date', () => ({
  toISOStringOrNull: vi.fn((d: unknown) =>
    d ? new Date(d as string).toISOString() : null
  ),
  toISOStringOrFallback: vi.fn((d: unknown) =>
    d ? new Date(d as string).toISOString() : new Date().toISOString()
  ),
}));

vi.mock('@/lib/utils/redirect-error', () => ({
  throwIfRedirect: mockThrowIfRedirect,
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: { RELEASES: '/dashboard/releases', SIGNIN: '/signin' },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  ne: vi.fn((a: unknown, b: unknown) => [a, b]),
  count: vi.fn((col: unknown) => col),
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: vi.fn(() => null),
}));

vi.mock('@/lib/discography/provider-domains', () => ({
  validateProviderUrl: vi.fn(),
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: { id: 'id' },
}));

vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  dspArtistMatches: {
    id: 'id',
    creatorProfileId: 'creatorProfileId',
    providerId: 'providerId',
    externalArtistId: 'externalArtistId',
    externalArtistName: 'externalArtistName',
    externalArtistUrl: 'externalArtistUrl',
    externalArtistImageUrl: 'externalArtistImageUrl',
    status: 'status',
    settings: 'settings',
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkIsrcRescanRateLimit: vi.fn(),
  checkReleaseRefreshRateLimit: vi.fn().mockResolvedValue({ success: true }),
  formatTimeRemaining: vi.fn(),
}));

vi.mock('@/lib/dsp-enrichment/jobs/release-enrichment', () => ({
  processReleaseEnrichmentJobStandalone: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user_abc123';
const MOCK_PROFILE = {
  id: 'prof_001',
  spotifyId: 'spotify_artist_1',
  username: 'testartist',
  usernameNormalized: 'testartist',
  settings: {},
};

function makeDashboardData(overrides: Record<string, unknown> = {}) {
  return {
    needsOnboarding: false,
    selectedProfile: MOCK_PROFILE,
    creatorProfiles: [MOCK_PROFILE],
    ...overrides,
  };
}

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel_001',
    title: 'Test Album',
    slug: 'test-album',
    releaseDate: new Date('2025-01-01'),
    artworkUrl: 'https://img.example.com/art.jpg',
    spotifyPopularity: 42,
    creatorProfileId: MOCK_PROFILE.id,
    releaseType: 'album',
    upc: '123456789012',
    label: 'Test Label',
    totalTracks: 10,
    trackSummary: { totalDurationMs: 3600000, primaryIsrc: 'US1234567890' },
    metadata: null,
    providerLinks: [
      {
        providerId: 'spotify',
        url: 'https://open.spotify.com/album/abc',
        sourceType: 'ingested',
        updatedAt: new Date(),
      },
    ],
    ...overrides,
  };
}

/** Set up a chain mock for db.select().from().where().limit() */
function setupDbSelectChain(result: unknown[]) {
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  });
}

/** Set up a chain mock for db.update().set().where() */
function setupDbUpdateChain() {
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('@critical releases/actions.ts — create/sync operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbUpdate.mockReset();
    mockGetCachedAuth.mockResolvedValue({ userId: MOCK_USER_ID });
    mockGetDashboardData.mockResolvedValue(makeDashboardData());
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
  });

  // =========================================================================
  // loadReleaseMatrix
  // =========================================================================
  describe('loadReleaseMatrix', () => {
    it('returns mapped releases for authenticated user', async () => {
      const release = makeRelease();
      mockGetReleasesForProfile.mockResolvedValue([release]);

      const { loadReleaseMatrix } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await loadReleaseMatrix();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rel_001');
      expect(result[0].title).toBe('Test Album');
      expect(result[0].profileId).toBe(MOCK_PROFILE.id);
    });

    it('redirects to sign-in when not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { loadReleaseMatrix } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(loadReleaseMatrix()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('/signin')
      );
    });

    it('redirects to onboarding when profile needs onboarding', async () => {
      mockGetDashboardData.mockResolvedValue(
        makeDashboardData({ needsOnboarding: true })
      );

      const { loadReleaseMatrix } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(loadReleaseMatrix()).rejects.toThrow('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
    });

    it('filters provider links to only those with URLs', async () => {
      const release = makeRelease({
        providerLinks: [
          {
            providerId: 'spotify',
            url: 'https://open.spotify.com/album/abc',
            sourceType: 'ingested',
            updatedAt: new Date(),
          },
        ],
      });
      mockGetReleasesForProfile.mockResolvedValue([release]);

      const { loadReleaseMatrix } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await loadReleaseMatrix();

      // Should only contain providers that have a URL
      for (const provider of result[0].providers) {
        expect(provider.url).not.toBe('');
      }
    });
  });

  // =========================================================================
  // syncFromSpotify
  // =========================================================================
  describe('syncFromSpotify', () => {
    it('syncs releases and triggers discovery on success', async () => {
      mockSyncReleasesFromSpotify.mockResolvedValue({
        success: true,
        imported: 5,
        releases: [],
        errors: [],
      });
      mockEnqueueDspArtistDiscoveryJob.mockResolvedValue(undefined);
      mockEnqueueMusicFetchEnrichmentJob.mockResolvedValue(undefined);

      const { syncFromSpotify } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await syncFromSpotify();

      expect(result.success).toBe(true);
      expect(result.imported).toBe(5);
      expect(mockRevalidateTag).toHaveBeenCalled();
      expect(mockEnqueueDspArtistDiscoveryJob).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorProfileId: MOCK_PROFILE.id,
          targetProviders: ['apple_music'],
        })
      );
    });

    it('returns error when no Spotify ID on profile', async () => {
      mockGetDashboardData.mockResolvedValue(
        makeDashboardData({
          selectedProfile: { ...MOCK_PROFILE, spotifyId: null },
          creatorProfiles: [{ ...MOCK_PROFILE, spotifyId: null }],
        })
      );

      const { syncFromSpotify } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await syncFromSpotify();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No Spotify artist connected');
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { syncFromSpotify } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(syncFromSpotify()).rejects.toThrow('Unauthorized');
    });

    it('returns failure details on sync error', async () => {
      mockSyncReleasesFromSpotify.mockResolvedValue({
        success: false,
        imported: 0,
        releases: [],
        errors: ['Spotify API rate limited'],
      });

      const { syncFromSpotify } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await syncFromSpotify();

      expect(result.success).toBe(false);
      expect(result.message).toBe('Spotify API rate limited');
      expect(result.errors).toContain('Spotify API rate limited');
    });
  });

  // =========================================================================
  // checkSpotifyConnection
  // =========================================================================
  describe('checkSpotifyConnection', () => {
    it('returns connected when profile has Spotify ID', async () => {
      mockGetDashboardData.mockResolvedValue(
        makeDashboardData({
          selectedProfile: {
            ...MOCK_PROFILE,
            spotifyId: 'sp_123',
            settings: { spotifyArtistName: 'Test Artist' },
          },
        })
      );

      const { checkSpotifyConnection } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await checkSpotifyConnection();

      expect(result.connected).toBe(true);
      expect(result.spotifyId).toBe('sp_123');
      expect(result.artistName).toBe('Test Artist');
    });

    it('returns not connected when no user', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { checkSpotifyConnection } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await checkSpotifyConnection();

      expect(result.connected).toBe(false);
      expect(result.spotifyId).toBeNull();
    });

    it('returns not connected when needs onboarding', async () => {
      mockGetDashboardData.mockResolvedValue(
        makeDashboardData({ needsOnboarding: true })
      );

      const { checkSpotifyConnection } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await checkSpotifyConnection();

      expect(result.connected).toBe(false);
    });
  });

  // =========================================================================
  // connectSpotifyArtist
  // =========================================================================
  describe('connectSpotifyArtist', () => {
    const connectParams = {
      spotifyArtistId: 'sp_artist_1',
      spotifyArtistUrl: 'https://open.spotify.com/artist/sp_artist_1',
      artistName: 'Test Artist',
    };

    it('connects Spotify artist and starts background import', async () => {
      setupDbSelectChain([{ settings: {} }]);
      setupDbUpdateChain();
      // Background fire-and-forget calls sync; set up mock to prevent unhandled rejection
      mockSyncReleasesFromSpotify.mockResolvedValue({
        success: true,
        imported: 3,
        releases: [],
        errors: [],
      });

      const { connectSpotifyArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await connectSpotifyArtist(connectParams);
      expect(result.success).toBe(true);
      expect(result.importing).toBe(true);
      expect(result.imported).toBe(0);
      expect(result.artistName).toBe('Test Artist');
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { connectSpotifyArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(connectSpotifyArtist(connectParams)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('returns importing state even when sync would fail (fire-and-forget)', async () => {
      setupDbSelectChain([{ settings: {} }]);
      setupDbUpdateChain();
      // Even with a failing sync, connectSpotifyArtist returns immediately
      mockSyncReleasesFromSpotify.mockResolvedValue({
        success: false,
        imported: 0,
        releases: [],
        errors: ['API error'],
      });

      const { connectSpotifyArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await connectSpotifyArtist(connectParams);

      // Fire-and-forget: always returns success/importing immediately
      expect(result.success).toBe(true);
      expect(result.importing).toBe(true);
      expect(result.imported).toBe(0);
    });

    it('handles unique constraint race conflicts gracefully', async () => {
      setupDbSelectChain([{ settings: {} }]);
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(
            Object.assign(
              new Error(
                'duplicate key value violates unique constraint "creator_profiles_spotify_id_unique"'
              ),
              {
                code: '23505',
                constraint: 'creator_profiles_spotify_id_unique',
              }
            )
          ),
        }),
      });

      const { connectSpotifyArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await connectSpotifyArtist(connectParams);

      expect(result.success).toBe(false);
      expect(result.imported).toBe(0);
      expect(result.message).toMatch(
        /already linked to another jovie account/i
      );
    });
  });
});
