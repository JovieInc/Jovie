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
  mockGetReleaseById,
  mockGetReleasesForProfile,
  mockGetTracksForReleaseWithProviders,
  mockUpsertProviderLink,
  mockResetProviderLinkDb,
  mockGetProviderLink,
  mockValidateProviderUrl,
  mockSyncReleasesFromSpotify,
  mockCheckIsrcRescanRateLimit,
  mockFormatTimeRemaining,
  mockProcessReleaseEnrichmentJobStandalone,
  mockTrackServerEvent,
  mockCaptureError,
  mockEnqueueDspArtistDiscoveryJob,
  mockEnqueueDspTrackEnrichmentJob,
  mockEnqueueMusicFetchEnrichmentJob,
  mockThrowIfRedirect,
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockRedirect: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockGetReleaseById: vi.fn(),
  mockGetReleasesForProfile: vi.fn(),
  mockGetTracksForReleaseWithProviders: vi.fn(),
  mockUpsertProviderLink: vi.fn(),
  mockResetProviderLinkDb: vi.fn(),
  mockGetProviderLink: vi.fn(),
  mockValidateProviderUrl: vi.fn(),
  mockSyncReleasesFromSpotify: vi.fn(),
  mockCheckIsrcRescanRateLimit: vi.fn(),
  mockFormatTimeRemaining: vi.fn(),
  mockProcessReleaseEnrichmentJobStandalone: vi.fn(),
  mockTrackServerEvent: vi.fn(),
  mockCaptureError: vi.fn(),
  mockEnqueueDspArtistDiscoveryJob: vi.fn(),
  mockEnqueueDspTrackEnrichmentJob: vi.fn(),
  mockEnqueueMusicFetchEnrichmentJob: vi.fn(),
  mockThrowIfRedirect: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: vi.fn().mockResolvedValue(null),
}));

// The releases/actions.ts imports from '../actions' which resolves to the dashboard actions barrel
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
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
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

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', settings: 'settings' },
}));

vi.mock('@/lib/discography/config', () => ({
  PRIMARY_PROVIDER_KEYS: ['spotify', 'apple_music'],
  PROVIDER_CONFIG: {
    spotify: { label: 'Spotify' },
    apple_music: { label: 'Apple Music' },
    youtube_music: { label: 'YouTube Music' },
  },
}));

vi.mock('@/lib/discography/provider-domains', () => ({
  validateProviderUrl: mockValidateProviderUrl,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleaseById: mockGetReleaseById,
  getReleasesForProfile: mockGetReleasesForProfile,
  getTracksForReleaseWithProviders: mockGetTracksForReleaseWithProviders,
  upsertProviderLink: mockUpsertProviderLink,
  resetProviderLink: mockResetProviderLinkDb,
  getProviderLink: mockGetProviderLink,
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

vi.mock('@/lib/dsp-enrichment/jobs/release-enrichment', () => ({
  processReleaseEnrichmentJobStandalone:
    mockProcessReleaseEnrichmentJobStandalone,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueDspArtistDiscoveryJob: mockEnqueueDspArtistDiscoveryJob,
  enqueueDspTrackEnrichmentJob: mockEnqueueDspTrackEnrichmentJob,
  enqueueMusicFetchEnrichmentJob: mockEnqueueMusicFetchEnrichmentJob,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkIsrcRescanRateLimit: mockCheckIsrcRescanRateLimit,
  formatTimeRemaining: mockFormatTimeRemaining,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: vi.fn(() => null),
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
  APP_ROUTES: { RELEASES: '/dashboard/releases' },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
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

function makeTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trk_001',
    releaseId: 'rel_001',
    title: 'Test Track',
    slug: 'test-track',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 240000,
    isrc: 'USABC1234567',
    isExplicit: false,
    previewUrl: null,
    providerLinks: [],
    ...overrides,
  };
}

/** Set up a chain mock for db.select().from().where().limit() */
function setupDbSelectChain(result: unknown[]) {
  mockDbSelect.mockReturnValue({
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

/** Set up a chain mock for db.delete().where() */
function setupDbDeleteChain() {
  mockDbDelete.mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
}

/** Set up a chain mock for db.insert().values().onConflictDoUpdate().returning() */
function setupDbInsertChain(returnResult: unknown[]) {
  mockDbInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returnResult),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('@critical releases/actions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        expect.stringContaining('/sign-in')
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
  // saveProviderOverride
  // =========================================================================
  describe('saveProviderOverride', () => {
    const validParams = {
      profileId: MOCK_PROFILE.id,
      releaseId: 'rel_001',
      provider: 'spotify' as const,
      url: 'https://open.spotify.com/album/xyz',
    };

    it('saves a valid provider URL override', async () => {
      mockValidateProviderUrl.mockReturnValue({ valid: true });
      mockUpsertProviderLink.mockResolvedValue(undefined);
      mockGetReleaseById.mockResolvedValue(makeRelease());

      const { saveProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await saveProviderOverride(validParams);

      expect(result.id).toBe('rel_001');
      expect(mockUpsertProviderLink).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseId: 'rel_001',
          providerId: 'spotify',
          sourceType: 'manual',
        })
      );
      expect(mockRevalidateTag).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/releases');
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { saveProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(saveProviderOverride(validParams)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('rejects empty URL', async () => {
      const { saveProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        saveProviderOverride({ ...validParams, url: '   ' })
      ).rejects.toThrow('URL is required');
    });

    it('rejects invalid provider URL', async () => {
      mockValidateProviderUrl.mockReturnValue({
        valid: false,
        error: 'URL does not match Spotify domain',
      });

      const { saveProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        saveProviderOverride({
          ...validParams,
          url: 'https://evil.com/album/xyz',
        })
      ).rejects.toThrow('URL does not match Spotify domain');
    });

    it('rejects profile mismatch', async () => {
      const { saveProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        saveProviderOverride({ ...validParams, profileId: 'other_profile' })
      ).rejects.toThrow('Profile mismatch');
    });
  });

  // =========================================================================
  // resetProviderOverride
  // =========================================================================
  describe('resetProviderOverride', () => {
    const params = {
      profileId: MOCK_PROFILE.id,
      releaseId: 'rel_001',
      provider: 'spotify' as const,
    };

    it('resets provider link to ingested', async () => {
      mockGetProviderLink.mockResolvedValue({
        url: 'https://open.spotify.com/album/original',
        sourceType: 'ingested',
      });
      mockResetProviderLinkDb.mockResolvedValue(undefined);
      mockGetReleaseById.mockResolvedValue(makeRelease());

      const { resetProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await resetProviderOverride(params);

      expect(result.id).toBe('rel_001');
      expect(mockResetProviderLinkDb).toHaveBeenCalledWith(
        'rel_001',
        'spotify',
        'https://open.spotify.com/album/original'
      );
      expect(mockRevalidateTag).toHaveBeenCalled();
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { resetProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(resetProviderOverride(params)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('rejects profile mismatch', async () => {
      const { resetProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        resetProviderOverride({ ...params, profileId: 'wrong_profile' })
      ).rejects.toThrow('Profile mismatch');
    });
  });

  // =========================================================================
  // refreshRelease
  // =========================================================================
  describe('refreshRelease', () => {
    it('returns refreshed release data', async () => {
      const release = makeRelease();
      mockGetReleaseById.mockResolvedValue(release);

      const { refreshRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await refreshRelease({ releaseId: 'rel_001' });

      expect(result.id).toBe('rel_001');
      expect(result.title).toBe('Test Album');
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { refreshRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(refreshRelease({ releaseId: 'rel_001' })).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('throws when release does not belong to profile', async () => {
      mockGetReleaseById.mockResolvedValue(
        makeRelease({ creatorProfileId: 'other_profile' })
      );

      const { refreshRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(refreshRelease({ releaseId: 'rel_001' })).rejects.toThrow(
        'Release not found'
      );
    });
  });

  // =========================================================================
  // rescanIsrcLinks
  // =========================================================================
  describe('rescanIsrcLinks', () => {
    it('runs enrichment when not rate limited and Apple Music match exists', async () => {
      const release = makeRelease();
      mockGetReleaseById.mockResolvedValue(release);
      mockCheckIsrcRescanRateLimit.mockResolvedValue({ success: true });
      setupDbSelectChain([
        {
          id: 'match_001',
          externalArtistId: 'am_artist_1',
          status: 'confirmed',
        },
      ]);
      mockProcessReleaseEnrichmentJobStandalone.mockResolvedValue({
        releasesEnriched: 3,
      });

      const { rescanIsrcLinks } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await rescanIsrcLinks({ releaseId: 'rel_001' });

      expect(result.rateLimited).toBe(false);
      expect(result.linksFound).toBe(3);
      expect(mockProcessReleaseEnrichmentJobStandalone).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorProfileId: MOCK_PROFILE.id,
          providerId: 'apple_music',
        })
      );
      expect(mockRevalidateTag).toHaveBeenCalled();
    });

    it('returns rate limited response when rate limit hit', async () => {
      const release = makeRelease();
      mockGetReleaseById.mockResolvedValue(release);
      mockCheckIsrcRescanRateLimit.mockResolvedValue({
        success: false,
        reset: Date.now() + 300000,
      });
      mockFormatTimeRemaining.mockReturnValue('5 minutes');

      const { rescanIsrcLinks } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await rescanIsrcLinks({ releaseId: 'rel_001' });

      expect(result.rateLimited).toBe(true);
      expect(result.retryAfter).toBe('5 minutes');
      expect(result.linksFound).toBe(0);
      expect(mockProcessReleaseEnrichmentJobStandalone).not.toHaveBeenCalled();
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { rescanIsrcLinks } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(rescanIsrcLinks({ releaseId: 'rel_001' })).rejects.toThrow(
        'Unauthorized'
      );
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

    it('connects Spotify artist and syncs releases', async () => {
      setupDbSelectChain([{ settings: {} }]);
      setupDbUpdateChain();
      mockSyncReleasesFromSpotify.mockResolvedValue({
        success: true,
        imported: 3,
        releases: [makeRelease()],
        errors: [],
      });
      mockEnqueueDspArtistDiscoveryJob.mockResolvedValue(undefined);
      mockEnqueueMusicFetchEnrichmentJob.mockResolvedValue(undefined);

      const { connectSpotifyArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await connectSpotifyArtist(connectParams);

      expect(result.success).toBe(true);
      expect(result.imported).toBe(3);
      expect(result.artistName).toBe('Test Artist');
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/releases');
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

    it('returns failure when sync fails', async () => {
      setupDbSelectChain([{ settings: {} }]);
      setupDbUpdateChain();
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

      expect(result.success).toBe(false);
      expect(result.imported).toBe(0);
    });
  });

  // =========================================================================
  // loadTracksForRelease
  // =========================================================================
  describe('loadTracksForRelease', () => {
    it('returns tracks for a valid release', async () => {
      mockGetReleaseById.mockResolvedValue(makeRelease());
      mockGetTracksForReleaseWithProviders.mockResolvedValue({
        tracks: [makeTrack(), makeTrack({ id: 'trk_002', trackNumber: 2 })],
      });

      const { loadTracksForRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await loadTracksForRelease({
        releaseId: 'rel_001',
        releaseSlug: 'test-album',
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('trk_001');
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { loadTracksForRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        loadTracksForRelease({
          releaseId: 'rel_001',
          releaseSlug: 'test-album',
        })
      ).rejects.toThrow('Unauthorized');
    });

    it('throws when release does not belong to profile', async () => {
      mockGetReleaseById.mockResolvedValue(
        makeRelease({ creatorProfileId: 'other_profile' })
      );

      const { loadTracksForRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        loadTracksForRelease({
          releaseId: 'rel_001',
          releaseSlug: 'test-album',
        })
      ).rejects.toThrow('Release not found');
    });
  });

  // =========================================================================
  // deleteRelease
  // =========================================================================
  describe('deleteRelease', () => {
    it('deletes a release owned by the user', async () => {
      mockGetReleaseById.mockResolvedValue(makeRelease());
      setupDbDeleteChain();

      const { deleteRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await deleteRelease({ releaseId: 'rel_001' });

      expect(result.success).toBe(true);
      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockRevalidateTag).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/releases');
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { deleteRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(deleteRelease({ releaseId: 'rel_001' })).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('throws when release does not belong to profile', async () => {
      mockGetReleaseById.mockResolvedValue(
        makeRelease({ creatorProfileId: 'other_profile' })
      );

      const { deleteRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(deleteRelease({ releaseId: 'rel_001' })).rejects.toThrow(
        'Release not found'
      );
    });
  });

  // =========================================================================
  // uploadReleaseArtwork
  // =========================================================================
  describe('uploadReleaseArtwork', () => {
    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { uploadReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const mockFile = new File(['data'], 'art.jpg', { type: 'image/jpeg' });

      await expect(uploadReleaseArtwork('rel_001', mockFile)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('throws when release does not belong to profile', async () => {
      mockGetReleaseById.mockResolvedValue(
        makeRelease({ creatorProfileId: 'other_profile' })
      );

      const { uploadReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const mockFile = new File(['data'], 'art.jpg', { type: 'image/jpeg' });

      await expect(uploadReleaseArtwork('rel_001', mockFile)).rejects.toThrow(
        'Release not found'
      );
    });

    it('calls artwork upload API and returns result', async () => {
      mockGetReleaseById.mockResolvedValue(makeRelease());

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          artworkUrl: 'https://cdn.example.com/new-art.jpg',
          sizes: { '300': 'https://cdn.example.com/300.jpg' },
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { uploadReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const mockFile = new File(['data'], 'art.jpg', { type: 'image/jpeg' });

      const result = await uploadReleaseArtwork('rel_001', mockFile);

      expect(result.artworkUrl).toBe('https://cdn.example.com/new-art.jpg');
      expect(mockRevalidateTag).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('throws when upload API returns error', async () => {
      mockGetReleaseById.mockResolvedValue(makeRelease());

      const mockResponse = {
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'File too large' }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const { uploadReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const mockFile = new File(['data'], 'art.jpg', { type: 'image/jpeg' });

      await expect(uploadReleaseArtwork('rel_001', mockFile)).rejects.toThrow(
        'File too large'
      );

      vi.unstubAllGlobals();
    });
  });

  // =========================================================================
  // updateAllowArtworkDownloads
  // =========================================================================
  describe('updateAllowArtworkDownloads', () => {
    it('updates artwork download setting', async () => {
      setupDbSelectChain([{ settings: { existingKey: 'value' } }]);
      setupDbUpdateChain();

      const { updateAllowArtworkDownloads } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      await updateAllowArtworkDownloads(true);

      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { updateAllowArtworkDownloads } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(updateAllowArtworkDownloads(true)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('wraps database errors with user-friendly message', async () => {
      setupDbSelectChain([{ settings: {} }]);
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('DB connection lost')),
        }),
      });

      const { updateAllowArtworkDownloads } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(updateAllowArtworkDownloads(false)).rejects.toThrow(
        'Failed to update artwork download setting'
      );
    });
  });

  // =========================================================================
  // revertReleaseArtwork
  // =========================================================================
  describe('revertReleaseArtwork', () => {
    it('reverts to original artwork URL', async () => {
      mockGetReleaseById.mockResolvedValue(
        makeRelease({
          metadata: {
            originalArtworkUrl: 'https://cdn.example.com/original.jpg',
            originalArtworkSizes: {
              '300': 'https://cdn.example.com/orig-300.jpg',
            },
          },
        })
      );
      setupDbUpdateChain();

      const { revertReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await revertReleaseArtwork('rel_001');

      expect(result.artworkUrl).toBe('https://cdn.example.com/original.jpg');
      expect(result.originalArtworkUrl).toBe(
        'https://cdn.example.com/original.jpg'
      );
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockRevalidateTag).toHaveBeenCalled();
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { revertReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(revertReleaseArtwork('rel_001')).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('throws when no original artwork exists', async () => {
      mockGetReleaseById.mockResolvedValue(makeRelease({ metadata: {} }));

      const { revertReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(revertReleaseArtwork('rel_001')).rejects.toThrow(
        'No original artwork to revert to'
      );
    });

    it('throws when release does not belong to profile', async () => {
      mockGetReleaseById.mockResolvedValue(
        makeRelease({ creatorProfileId: 'other_profile' })
      );

      const { revertReleaseArtwork } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(revertReleaseArtwork('rel_001')).rejects.toThrow(
        'Release not found'
      );
    });
  });

  // =========================================================================
  // checkAppleMusicConnection
  // =========================================================================
  describe('checkAppleMusicConnection', () => {
    it('returns connected when confirmed match exists', async () => {
      setupDbSelectChain([
        {
          externalArtistName: 'Test Artist AM',
          externalArtistId: 'am_123',
          status: 'confirmed',
        },
      ]);

      const { checkAppleMusicConnection } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await checkAppleMusicConnection();

      expect(result.connected).toBe(true);
      expect(result.artistName).toBe('Test Artist AM');
      expect(result.artistId).toBe('am_123');
    });

    it('returns not connected when no match', async () => {
      setupDbSelectChain([]);

      const { checkAppleMusicConnection } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await checkAppleMusicConnection();

      expect(result.connected).toBe(false);
      expect(result.artistName).toBeNull();
    });

    it('returns not connected when unauthenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { checkAppleMusicConnection } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await checkAppleMusicConnection();

      expect(result.connected).toBe(false);
    });
  });

  // =========================================================================
  // connectAppleMusicArtist
  // =========================================================================
  describe('connectAppleMusicArtist', () => {
    const appleParams = {
      externalArtistId: 'am_artist_1',
      externalArtistName: 'Test Artist',
      externalArtistUrl:
        'https://music.apple.com/us/artist/test-artist/am_artist_1',
    };

    it('connects Apple Music artist and enqueues enrichment', async () => {
      setupDbInsertChain([{ id: 'match_new' }]);
      mockEnqueueDspTrackEnrichmentJob.mockResolvedValue(undefined);

      const { connectAppleMusicArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await connectAppleMusicArtist(appleParams);

      expect(result.success).toBe(true);
      expect(result.artistName).toBe('Test Artist');
      expect(mockDbInsert).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/releases');
    });

    it('rejects unauthenticated calls', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { connectAppleMusicArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(connectAppleMusicArtist(appleParams)).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('rejects empty required fields', async () => {
      const { connectAppleMusicArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        connectAppleMusicArtist({
          ...appleParams,
          externalArtistId: '  ',
        })
      ).rejects.toThrow('Apple Music artist data is required');
    });

    it('rejects invalid Apple Music URL', async () => {
      const { connectAppleMusicArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        connectAppleMusicArtist({
          ...appleParams,
          externalArtistUrl: 'https://evil.com/artist/test',
        })
      ).rejects.toThrow('Invalid Apple Music artist URL');
    });

    it('returns failure when database insert fails', async () => {
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      });

      const { connectAppleMusicArtist } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await connectAppleMusicArtist(appleParams);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to save');
    });
  });

  // =========================================================================
  // Cache invalidation patterns
  // =========================================================================
  describe('cache invalidation', () => {
    it('saveProviderOverride invalidates tag and path', async () => {
      mockValidateProviderUrl.mockReturnValue({ valid: true });
      mockUpsertProviderLink.mockResolvedValue(undefined);
      mockGetReleaseById.mockResolvedValue(makeRelease());

      const { saveProviderOverride } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      await saveProviderOverride({
        profileId: MOCK_PROFILE.id,
        releaseId: 'rel_001',
        provider: 'spotify' as const,
        url: 'https://open.spotify.com/album/xyz',
      });

      expect(mockRevalidateTag).toHaveBeenCalledWith(
        `releases:${MOCK_USER_ID}:${MOCK_PROFILE.id}`,
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/releases');
    });

    it('deleteRelease invalidates tag and path', async () => {
      mockGetReleaseById.mockResolvedValue(makeRelease());
      setupDbDeleteChain();

      const { deleteRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      await deleteRelease({ releaseId: 'rel_001' });

      expect(mockRevalidateTag).toHaveBeenCalledWith(
        `releases:${MOCK_USER_ID}:${MOCK_PROFILE.id}`,
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/releases');
    });
  });
});
