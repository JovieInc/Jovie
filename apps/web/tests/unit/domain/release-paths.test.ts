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
  mockDbInsert,
  mockDbInsertValues,
  mockDbInsertReturning,
  mockDbUpdate,
  mockGetReleaseById,
  mockCaptureError,
  mockTrackServerEvent,
  mockGenerateUniqueSlug,
  mockInvalidateReleaseCaches,
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
  mockDbInsert: vi.fn(),
  mockDbInsertValues: vi.fn(),
  mockDbInsertReturning: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockGetReleaseById: vi.fn(),
  mockCaptureError: vi.fn(),
  mockTrackServerEvent: vi.fn(),
  mockGenerateUniqueSlug: vi.fn(),
  mockInvalidateReleaseCaches: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
  getCachedCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardDataEssential: mockGetDashboardData,
}));

// The release-matrix loader imports getDashboardDataEssential from the
// dashboard-data submodule directly (not the barrel), so both module paths
// must resolve to the mock or the real fetch runs and redirects to /start.
vi.mock('@/app/app/(shell)/dashboard/actions/dashboard-data', () => ({
  getDashboardDataEssential: mockGetDashboardData,
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
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', settings: 'settings', spotifyId: 'spotifyId' },
}));

vi.mock('@/lib/db/schema', () => ({}));

vi.mock('@/lib/db/errors', () => ({ isUniqueViolation: vi.fn(() => false) }));

vi.mock('@/lib/discography/slug', () => ({
  generateUniqueSlug: mockGenerateUniqueSlug,
}));

vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: mockInvalidateReleaseCaches,
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
  getReleaseById: mockGetReleaseById,
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
  fireDspDiscovery: (params: {
    creatorProfileId: string;
    spotifyArtistId: string;
  }) => {
    void mockEnqueueDspArtistDiscoveryJob({
      creatorProfileId: params.creatorProfileId,
      spotifyArtistId: params.spotifyArtistId,
      targetProviders: ['apple_music', 'deezer', 'musicbrainz'],
    }).catch(() => {});
  },
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
  APP_ROUTES: {
    RELEASES: '/dashboard/releases',
    SIGNIN: '/signin',
    START: '/start',
  },
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
// The form action and the chat tool must save the same release.
// ---------------------------------------------------------------------------
const MOCK_USER_ID = 'user_abc123';
const MOCK_PROFILE = {
  id: 'prof_001',
  spotifyId: 'spotify_artist_1',
  username: 'testartist',
  usernameNormalized: 'testartist',
  displayName: 'Test Artist',
  isPublic: true,
  onboardingCompletedAt: new Date('2025-01-01'),
  settings: {},
};

function setupDbInsertChain(rows: unknown[]) {
  mockDbInsertValues.mockReturnValue({ returning: mockDbInsertReturning });
  mockDbInsertReturning.mockResolvedValue(rows);
  mockDbInsert.mockReturnValue({ values: mockDbInsertValues });
}

const FUTURE = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .slice(0, 10);

const CASES = [
  {
    name: 'a scheduled single with genres and the explicit flag',
    input: {
      title: '  Night Drive  ',
      releaseType: 'single' as const,
      releaseDate: FUTURE,
      genres: ['house', 'electronic', 'dance', 'techno'],
      isExplicit: true,
    },
  },
  {
    name: 'a draft EP with no date',
    input: { title: 'Soft Focus', releaseType: 'ep' as const },
  },
  {
    name: 'a released album in the past',
    input: {
      title: 'Álbum Número Uno',
      releaseType: 'album' as const,
      releaseDate: '2020-05-01',
    },
  },
];

async function viaForm(input: (typeof CASES)[number]['input']) {
  const { createRelease } = await import(
    '@/app/app/(shell)/dashboard/releases/actions'
  );
  return createRelease(input);
}

async function viaChat(input: (typeof CASES)[number]['input']) {
  const { createReleaseTool } = await import('@/lib/ai/tools/create-release');
  const tool = createReleaseTool(MOCK_PROFILE.id, MOCK_USER_ID) as unknown as {
    execute: (input: unknown, options: unknown) => Promise<unknown>;
  };
  return tool.execute(input, { toolCallId: 't', messages: [] });
}

// The first test pays for importing the whole actions module graph.
vi.setConfig({ testTimeout: 30_000 });

describe('release create: the form action and the chat tool save identical rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert.mockReset();
    mockDbInsertValues.mockReset();
    mockDbInsertReturning.mockReset();
    mockGetCachedAuth.mockResolvedValue({ userId: MOCK_USER_ID });
    mockGetDashboardData.mockResolvedValue({
      needsOnboarding: false,
      selectedProfile: MOCK_PROFILE,
      creatorProfiles: [MOCK_PROFILE],
    });
    mockGetReleaseById.mockResolvedValue(null);
    mockGenerateUniqueSlug.mockImplementation(
      async (_profile: string, title: string) =>
        title
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
    );
    setupDbInsertChain([{ id: 'rel_new' }]);
  });

  it.each(CASES)('$name', async ({ input }) => {
    await viaForm(input);
    const formRow = mockDbInsertValues.mock.calls.at(-1)?.[0];
    const formSlugArgs = mockGenerateUniqueSlug.mock.calls.at(-1);
    mockDbInsertValues.mockClear();
    mockGenerateUniqueSlug.mockClear();

    await viaChat(input);
    const chatRow = mockDbInsertValues.mock.calls.at(-1)?.[0];
    const chatSlugArgs = mockGenerateUniqueSlug.mock.calls.at(-1);

    expect(formRow).toBeDefined();
    expect(chatRow).toEqual(formRow);
    // One slug rule, with the same inputs.
    expect(chatSlugArgs).toEqual(formSlugArgs);
    expect(formSlugArgs?.slice(0, 3)).toEqual([
      MOCK_PROFILE.id,
      input.title.trim(),
      'release',
    ]);
    // The fields the chat path used to drop are stored.
    expect(formRow).toMatchObject({
      sourceType: 'manual',
      isExplicit: input.isExplicit ?? false,
      genres: input.genres?.slice(0, 3) ?? null,
    });
    expect(['draft', 'scheduled', 'released']).toContain(
      (formRow as { status: string }).status
    );
  });

  it('both paths invalidate the same release caches', async () => {
    await viaForm(CASES[0].input);
    const formCall = mockInvalidateReleaseCaches.mock.calls.at(-1);
    mockInvalidateReleaseCaches.mockClear();
    await viaChat(CASES[0].input);
    expect(mockInvalidateReleaseCaches.mock.calls.at(-1)).toEqual(formCall);
    expect(formCall).toEqual([MOCK_USER_ID, MOCK_PROFILE.id]);
  });

  it('rejects the same bad input the same way', async () => {
    const form = (await viaForm({
      title: '   ',
      releaseType: 'single',
    })) as { success: boolean; message: string };
    const chat = (await viaChat({ title: '   ', releaseType: 'single' })) as {
      success: boolean;
      error: string;
    };
    expect(form.success).toBe(false);
    expect(chat.success).toBe(false);
    expect(chat.error).toBe(form.message);
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });
});
