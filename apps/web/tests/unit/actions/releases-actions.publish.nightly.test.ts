import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks -- must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------
const {
  mockGetCachedAuth,
  mockGetDashboardData,
  mockGetDashboardShellData,
  mockRedirect,
  mockRevalidateTag,
  mockRevalidatePath,
  mockGetReleaseById,
  mockCheckIsrcRescanRateLimit,
  mockCheckReleaseRefreshRateLimit,
  mockFormatTimeRemaining,
  mockProcessReleaseEnrichmentJobStandalone,
  mockEnqueueDspTrackEnrichmentJob,
  mockThrowIfRedirect,
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockCaptureError,
  mockValidateProviderUrl,
  mockUpsertProviderLink,
  mockGetReleasesForProfile,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockGetDashboardShellData: vi.fn(),
  mockRedirect: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockGetReleaseById: vi.fn(),
  mockCheckIsrcRescanRateLimit: vi.fn(),
  mockCheckReleaseRefreshRateLimit: vi.fn(),
  mockFormatTimeRemaining: vi.fn(),
  mockProcessReleaseEnrichmentJobStandalone: vi.fn(),
  mockEnqueueDspTrackEnrichmentJob: vi.fn(),
  mockThrowIfRedirect: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockCaptureError: vi.fn(),
  mockValidateProviderUrl: vi.fn(),
  mockUpsertProviderLink: vi.fn(),
  mockGetReleasesForProfile: vi.fn(),
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
  getDashboardShellData: mockGetDashboardShellData,
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
  discogRecordings: {
    id: 'recordingId',
    creatorProfileId: 'creatorProfileId',
    isrc: 'isrc',
  },
  discogReleaseTracks: {
    releaseId: 'releaseId',
    recordingId: 'recordingId',
  },
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

vi.mock('@/lib/discography/provider-domains', () => ({
  validateProviderUrl: mockValidateProviderUrl,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleaseById: mockGetReleaseById,
  getReleasesForProfile: mockGetReleasesForProfile,
  getTracksForReleaseWithProviders: vi.fn(),
  upsertProviderLink: mockUpsertProviderLink,
  resetProviderLink: vi.fn(),
  getProviderLink: vi.fn(),
}));

vi.mock('@/lib/discography/spotify-import', () => ({
  syncReleasesFromSpotify: vi.fn(),
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
  enqueueDspArtistDiscoveryJob: vi.fn(),
  enqueueDspTrackEnrichmentJob: mockEnqueueDspTrackEnrichmentJob,
  enqueueMusicFetchEnrichmentJob: vi.fn(),
  fireDspDiscovery: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkIsrcRescanRateLimit: mockCheckIsrcRescanRateLimit,
  checkReleaseRefreshRateLimit: mockCheckReleaseRefreshRateLimit,
  formatTimeRemaining: mockFormatTimeRemaining,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn(),
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
  inArray: vi.fn((column: unknown, values: unknown[]) => [column, values]),
  isNotNull: vi.fn((value: unknown) => value),
  ne: vi.fn((a: unknown, b: unknown) => [a, b]),
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
  const resolved = Promise.resolve(result);
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
        then: resolved.then.bind(resolved),
        catch: resolved.catch.bind(resolved),
        finally: resolved.finally.bind(resolved),
      }),
    }),
  });
}

function setupDbSelectJoinChain(result: unknown[]) {
  mockDbSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  });
}

function setupDbUpdateChain() {
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
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
describe('@critical releases/actions.ts — publish/status operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockReset();
    mockDbInsert.mockReset();
    mockDbUpdate.mockReset();
    mockDbDelete.mockReset();
    mockGetCachedAuth.mockResolvedValue({ userId: MOCK_USER_ID });
    mockGetDashboardData.mockResolvedValue(makeDashboardData());
    mockGetDashboardShellData.mockResolvedValue(makeDashboardData());
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    mockCheckReleaseRefreshRateLimit.mockResolvedValue({ success: true });
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
          providerId: 'apple_music',
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
          matchId: 'match_001',
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
      // revalidatePath is intentionally skipped to avoid resetting client-side
      // state (closing the sidebar). TanStack Query handles cache updates.
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('deleteRelease invalidates tag and path', async () => {
      mockGetReleaseById.mockResolvedValue(makeRelease());
      setupDbSelectJoinChain([]);
      setupDbUpdateChain();

      const { deleteRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      await deleteRelease({ releaseId: 'rel_001' });

      expect(mockRevalidateTag).toHaveBeenCalledWith(
        `releases:${MOCK_USER_ID}:${MOCK_PROFILE.id}`,
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/releases');
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });
});
