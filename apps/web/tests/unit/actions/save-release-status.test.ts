import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockGetDashboardData,
  mockGetReleaseById,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockGetReleaseById: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardDataEssential: mockGetDashboardData,
}));

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  unstable_cache: vi.fn((fn: () => unknown) => fn),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: mockDbUpdate,
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: { id: 'id' },
  discogRecordings: { id: 'recordingId' },
  discogReleaseTracks: { releaseId: 'releaseId' },
  discogTracks: { id: 'trackId' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id' },
}));

vi.mock('@/lib/db/queries/analytics', () => ({
  hasReleaseClickAnalytics: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/discography/config', () => ({
  PRIMARY_PROVIDER_KEYS: ['spotify'],
  PROVIDER_CONFIG: { spotify: { label: 'Spotify' } },
}));

vi.mock('@/lib/discography/provider-domains', () => ({
  validateProviderUrl: vi.fn(),
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleaseById: mockGetReleaseById,
  getReleaseTrackSummariesForReleases: vi.fn().mockResolvedValue(new Map()),
  getReleaseTracksForReleaseWithProviders: vi.fn(),
  getReleasesForProfile: vi.fn(),
  getTracksForReleaseWithProviders: vi.fn(),
  getTracksForRelease: vi.fn(),
  upsertProviderLink: vi.fn(),
  upsertRecording: vi.fn(),
  upsertReleaseTrack: vi.fn(),
  resetProviderLink: vi.fn(),
  getProviderLink: vi.fn(),
}));

vi.mock('@/lib/releases/release-lifecycle.server', () => ({
  archiveRelease: vi.fn(),
  restoreRelease: vi.fn(),
}));

vi.mock('@/lib/discography/spotify-import', () => ({
  syncReleasesFromSpotify: vi.fn(),
}));

vi.mock('@/lib/discography/types', () => ({}));

vi.mock('@/lib/discography/utils', () => ({
  buildSmartLinkPath: vi.fn(() => '/testartist/test-album'),
  buildTrackDeepLinkPath: vi.fn(() => '/testartist/test-album/track'),
}));

vi.mock('@/lib/discography/video-providers', () => ({
  VIDEO_PROVIDER_KEYS: ['youtube'],
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
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
  checkReleaseRefreshRateLimit: vi.fn(),
  formatTimeRemaining: vi.fn(),
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn(),
}));

vi.mock('@/lib/services/canvas/service', () => ({
  getCanvasStatusFromMetadata: vi.fn(() => null),
}));

vi.mock('@/lib/utils/date', () => ({
  toISOStringOrNull: vi.fn((value: unknown) =>
    value ? new Date(value as string).toISOString() : null
  ),
  toISOStringOrFallback: vi.fn((value: unknown) =>
    value ? new Date(value as string).toISOString() : new Date().toISOString()
  ),
}));

vi.mock('@/lib/utils/redirect-error', () => ({
  throwIfRedirect: vi.fn(),
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: { LIBRARY: '/app/library', RELEASES: '/dashboard/releases' },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((left: unknown, right: unknown) => [left, right]),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  ne: vi.fn(),
}));

vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  dspArtistMatches: { id: 'id' },
}));

vi.mock('@/lib/dsp-enrichment/jobs/release-enrichment', () => ({
  processReleaseEnrichmentJobStandalone: vi.fn(),
}));

const PROFILE = {
  id: 'prof_001',
  spotifyId: 'spotify_artist_1',
  username: 'testartist',
  usernameNormalized: 'testartist',
  settings: {},
};

function ownedRelease() {
  return {
    id: 'rel_001',
    title: 'Test Album',
    slug: 'test-album',
    releaseDate: new Date('2025-01-01'),
    artworkUrl: 'https://img.example.com/art.jpg',
    spotifyPopularity: 42,
    creatorProfileId: PROFILE.id,
    releaseType: 'album',
    upc: '123456789012',
    label: 'Test Label',
    totalTracks: 10,
    trackSummary: { totalDurationMs: 3600000, primaryIsrc: 'US1234567890' },
    metadata: null,
    providerLinks: [],
  };
}

describe('saveReleaseStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_abc123' });
    mockGetDashboardData.mockResolvedValue({
      needsOnboarding: false,
      selectedProfile: PROFILE,
      creatorProfiles: [PROFILE],
    });
    mockGetReleaseById.mockResolvedValue(ownedRelease());
  });

  it('writes draft, scheduled, and released onto the release row', async () => {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockDbUpdate.mockReturnValue({ set });

    const { saveReleaseStatus } = await import(
      '@/app/app/(shell)/dashboard/releases/actions'
    );

    for (const status of ['draft', 'scheduled', 'released'] as const) {
      const result = await saveReleaseStatus({
        profileId: PROFILE.id,
        releaseId: 'rel_001',
        status,
      });
      expect(result.id).toBe('rel_001');
    }

    expect(set.mock.calls.map(call => call[0]?.status)).toEqual([
      'draft',
      'scheduled',
      'released',
    ]);
  });

  it('rejects a status outside the editable set before touching the row', async () => {
    const { saveReleaseStatus } = await import(
      '@/app/app/(shell)/dashboard/releases/actions'
    );

    await expect(
      saveReleaseStatus({
        profileId: PROFILE.id,
        releaseId: 'rel_001',
        status: 'archived' as 'draft',
      })
    ).rejects.toThrow(new TypeError('Invalid release status'));
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockGetCachedAuth).not.toHaveBeenCalled();
  });
});
