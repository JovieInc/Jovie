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
  mockThrowIfRedirect,
  mockDbInsert,
  mockDbSelect,
  mockDbUpdate,
  mockDbDelete,
  mockGetTracksForRelease,
  mockUpsertRecording,
  mockUpsertReleaseTrack,
  mockCaptureError,
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
  mockThrowIfRedirect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockGetTracksForRelease: vi.fn(),
  mockUpsertRecording: vi.fn(),
  mockUpsertReleaseTrack: vi.fn(),
  mockCaptureError: vi.fn(),
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
    insert: mockDbInsert,
    select: mockDbSelect,
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
  discogTracks: { id: 'trackId', isrc: 'isrc' },
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
  getReleaseTracksForReleaseWithProviders: mockGetTracksForReleaseWithProviders,
  getReleasesForProfile: mockGetReleasesForProfile,
  getTracksForReleaseWithProviders: mockGetTracksForReleaseWithProviders,
  getTracksForRelease: mockGetTracksForRelease,
  upsertProviderLink: mockUpsertProviderLink,
  upsertRecording: mockUpsertRecording,
  upsertReleaseTrack: mockUpsertReleaseTrack,
  resetProviderLink: mockResetProviderLinkDb,
  getProviderLink: mockGetProviderLink,
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
  buildTrackDeepLinkPath: vi.fn(
    (
      handle: string,
      releaseSlug: string,
      trackSlug: string,
      provider?: string
    ) =>
      `/${handle}/${releaseSlug}/${trackSlug}${provider ? `/${provider}` : ''}`
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
  fireDspDiscovery: vi.fn(),
  enqueueDspArtistDiscoveryJob: vi.fn(),
  enqueueDspTrackEnrichmentJob: vi.fn(),
  enqueueMusicFetchEnrichmentJob: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkIsrcRescanRateLimit: vi.fn(),
  checkReleaseRefreshRateLimit: vi.fn().mockResolvedValue({ success: true }),
  formatTimeRemaining: vi.fn(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('@critical releases/actions.ts — update/edit operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert.mockReset();
    mockDbSelect.mockReset();
    mockDbUpdate.mockReset();
    mockDbDelete.mockReset();
    mockGetTracksForRelease.mockReset();
    mockUpsertRecording.mockReset();
    mockUpsertReleaseTrack.mockReset();
    mockGetCachedAuth.mockResolvedValue({ userId: MOCK_USER_ID });
    mockGetDashboardData.mockResolvedValue(makeDashboardData());
    mockRedirect.mockImplementation((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
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
      // revalidatePath is intentionally skipped to avoid resetting client-side
      // state (closing the sidebar). TanStack Query handles cache updates.
      expect(mockRevalidatePath).not.toHaveBeenCalled();
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

      expect(result.release.id).toBe('rel_001');
      expect(result.release.title).toBe('Test Album');
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
      setupDbSelectJoinChain([]);
      setupDbUpdateChain();

      const { deleteRelease } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await deleteRelease({ releaseId: 'rel_001' });

      expect(result.success).toBe(true);
      expect(mockDbUpdate).toHaveBeenCalled();
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

  describe('saveReleaseMetadata', () => {
    it('saves UPC and label on the release row', async () => {
      setupDbUpdateChain();
      mockGetReleaseById.mockResolvedValue(makeRelease());

      const { saveReleaseMetadata } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await saveReleaseMetadata({
        profileId: MOCK_PROFILE.id,
        releaseId: 'rel_001',
        upc: ' 555666777888 ',
        label: '  New Label  ',
      });

      expect(result.id).toBe('rel_001');
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockRevalidateTag).toHaveBeenCalled();
    });

    it('rejects invalid UPC input', async () => {
      const { saveReleaseMetadata } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        saveReleaseMetadata({
          profileId: MOCK_PROFILE.id,
          releaseId: 'rel_001',
          upc: 'ABC123',
          label: null,
        })
      ).rejects.toThrow('UPC must contain only digits');
    });
  });

  describe('savePrimaryIsrc', () => {
    it('updates an existing primary recording ISRC', async () => {
      setupDbUpdateChain();
      mockGetReleaseById.mockResolvedValue(makeRelease());
      mockGetTracksForReleaseWithProviders.mockResolvedValue({
        tracks: [{ recordingId: 'rec_001' }],
        total: 1,
        hasMore: false,
      });
      mockGetTracksForRelease.mockResolvedValue([]);
      setupDbSelectChain([]);

      const { savePrimaryIsrc } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      const result = await savePrimaryIsrc({
        profileId: MOCK_PROFILE.id,
        releaseId: 'rel_001',
        isrc: 'us-abc-1234567',
      });

      expect(result.id).toBe('rel_001');
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('creates the first recording and release track for manual releases without tracks', async () => {
      setupDbUpdateChain();
      mockGetReleaseById.mockResolvedValue(
        makeRelease({
          sourceType: 'manual',
          totalTracks: 0,
          trackSummary: undefined,
        })
      );
      mockGetTracksForReleaseWithProviders.mockResolvedValue({
        tracks: [],
        total: 0,
        hasMore: false,
      });
      mockGetTracksForRelease.mockResolvedValue([]);
      setupDbSelectChain([]);
      mockUpsertRecording.mockResolvedValue({ id: 'rec_new' });
      mockUpsertReleaseTrack.mockResolvedValue({ id: 'rt_new' });

      const { savePrimaryIsrc } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );
      await savePrimaryIsrc({
        profileId: MOCK_PROFILE.id,
        releaseId: 'rel_001',
        isrc: 'USABC1234567',
      });

      expect(mockUpsertRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorProfileId: MOCK_PROFILE.id,
          title: 'Test Album',
          isrc: 'USABC1234567',
          sourceType: 'manual',
        })
      );
      expect(mockUpsertReleaseTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          releaseId: 'rel_001',
          recordingId: 'rec_new',
          trackNumber: 1,
          discNumber: 1,
          sourceType: 'manual',
        })
      );
    });

    it('rejects trackless non-manual releases', async () => {
      mockGetReleaseById.mockResolvedValue(
        makeRelease({
          sourceType: 'spotify',
          totalTracks: 0,
          trackSummary: undefined,
        })
      );
      mockGetTracksForReleaseWithProviders.mockResolvedValue({
        tracks: [],
        total: 0,
        hasMore: false,
      });
      mockGetTracksForRelease.mockResolvedValue([]);
      setupDbSelectChain([]);

      const { savePrimaryIsrc } = await import(
        '@/app/app/(shell)/dashboard/releases/actions'
      );

      await expect(
        savePrimaryIsrc({
          profileId: MOCK_PROFILE.id,
          releaseId: 'rel_001',
          isrc: 'USABC1234567',
        })
      ).rejects.toThrow(
        'ISRC can only be edited automatically for manual releases without tracks'
      );
    });
  });
});
