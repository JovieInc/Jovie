import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockDbSelect,
  mockGetCachedAuth,
  mockIsActiveDiscoveryJob,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockDbSelect: vi.fn(),
  mockGetCachedAuth: vi.fn(),
  mockIsActiveDiscoveryJob: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/discovery/is-active-discovery-job', () => ({
  isActiveDiscoveryJob: mockIsActiveDiscoveryJob,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

function limitChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue(rows),
  };

  return chain;
}

function orderByChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn().mockResolvedValue(rows),
  };

  return chain;
}

function whereChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn().mockResolvedValue(rows),
  };

  return chain;
}

describe('GET /api/onboarding/discovery', () => {
  const validProfileId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_user_123' });
    mockIsActiveDiscoveryJob.mockReturnValue(false);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCachedAuth.mockResolvedValueOnce({ userId: null });

    const { GET } = await import('@/app/api/onboarding/discovery/route');
    const response = await GET(
      new Request('http://localhost/api/onboarding/discovery?profileId=test')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  }, 15_000);

  it('returns 400 when profileId is missing', async () => {
    const { GET } = await import('@/app/api/onboarding/discovery/route');
    const response = await GET(
      new Request('http://localhost/api/onboarding/discovery')
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'profileId is required',
    });
  });

  it('returns 400 when profileId is invalid', async () => {
    const { GET } = await import('@/app/api/onboarding/discovery/route');
    const response = await GET(
      new Request(
        'http://localhost/api/onboarding/discovery?profileId=not-a-uuid'
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'profileId must be a valid UUID',
    });
  });

  it('returns 404 when the profile does not exist', async () => {
    mockDbSelect.mockImplementationOnce(() => limitChain([]));

    const { GET } = await import('@/app/api/onboarding/discovery/route');
    const response = await GET(
      new Request(
        `http://localhost/api/onboarding/discovery?profileId=${validProfileId}`
      )
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile not found',
    });
  });

  it('returns 403 when the profile belongs to another user', async () => {
    mockDbSelect.mockImplementationOnce(() =>
      limitChain([
        {
          id: 'profile_123',
          username: 'artist',
          displayName: 'Artist',
          avatarUrl: null,
          bio: null,
          genres: ['pop'],
          location: 'Los Angeles',
          settings: { hometown: 'Los Angeles' },
          activeSinceYear: 2020,
          spotifyId: 'spotify_1',
          spotifyUrl: 'https://open.spotify.com/artist/spotify_1',
          appleMusicId: null,
          onboardingCompletedAt: new Date('2025-01-01T00:00:00.000Z'),
          clerkId: 'different_user',
        },
      ])
    );

    const { GET } = await import('@/app/api/onboarding/discovery/route');
    const response = await GET(
      new Request(
        `http://localhost/api/onboarding/discovery?profileId=${validProfileId}`
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns a shaped onboarding snapshot with pending discovery state', async () => {
    mockDbSelect
      .mockImplementationOnce(() =>
        limitChain([
          {
            id: 'profile_123',
            username: 'artist',
            displayName: 'Artist',
            avatarUrl: 'https://images.test/avatar.png',
            bio: 'Bio',
            genres: ['pop'],
            location: 'Los Angeles',
            settings: {
              hometown: 'Nashville',
              spotifyImportStatus: 'complete',
            },
            activeSinceYear: 2020,
            spotifyId: 'spotify_1',
            spotifyUrl: 'https://open.spotify.com/artist/spotify_1',
            appleMusicId: 'apple_1',
            onboardingCompletedAt: new Date('2025-01-01T00:00:00.000Z'),
            clerkId: 'clerk_user_123',
          },
        ])
      )
      .mockImplementationOnce(() =>
        orderByChain([
          {
            id: 'match_1',
            providerId: 'spotify',
            externalArtistId: 'spotify_1',
            externalArtistName: 'Artist',
            externalArtistUrl: 'https://open.spotify.com/artist/spotify_1',
            externalArtistImageUrl: 'https://images.test/spotify.png',
            confidenceScore: '0.95',
            status: 'confirmed',
            updatedAt: new Date('2025-01-02T00:00:00.000Z'),
          },
        ])
      )
      .mockImplementationOnce(() =>
        orderByChain([
          {
            id: 'link_1',
            platform: 'soundcloud',
            url: 'https://soundcloud.com/artist',
            displayText: 'artist',
            state: 'active',
            confidence: '0.81',
            sourcePlatform: 'spotify',
            updatedAt: new Date('2025-01-02T00:00:00.000Z'),
            version: 2,
          },
        ])
      )
      .mockImplementationOnce(() =>
        orderByChain([
          {
            id: 'suggestion_1',
            platform: 'youtube_music',
            url: 'https://music.youtube.com/channel/test',
            username: 'artist-official',
            sourceProvider: 'musicbrainz',
            confidenceScore: '0.67',
            status: 'pending',
            updatedAt: new Date('2025-01-03T00:00:00.000Z'),
          },
        ])
      )
      .mockImplementationOnce(() =>
        limitChain([
          {
            id: 'release_1',
            title: 'Latest Release',
            artworkUrl: 'https://images.test/release.png',
            releaseDate: new Date('2024-02-10T00:00:00.000Z'),
            spotifyPopularity: 75,
          },
        ])
      )
      .mockImplementationOnce(() => whereChain([{ value: 12 }]))
      .mockImplementationOnce(() => whereChain([{ value: 1 }]))
      .mockImplementationOnce(() => whereChain([{ value: 1 }]))
      .mockImplementationOnce(() =>
        limitChain([
          {
            status: 'processing',
            createdAt: new Date('2025-01-04T00:00:00.000Z'),
            updatedAt: new Date('2025-01-04T00:00:00.000Z'),
          },
        ])
      );
    mockIsActiveDiscoveryJob.mockReturnValueOnce(true);

    const { GET } = await import('@/app/api/onboarding/discovery/route');
    const response = await GET(
      new Request(
        `http://localhost/api/onboarding/discovery?profileId=${validProfileId}`
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.snapshot.profile).toEqual(
      expect.objectContaining({
        id: 'profile_123',
        username: 'artist',
        displayName: 'Artist',
        appleMusicConnected: true,
        hometown: 'Nashville',
      })
    );
    expect(payload.snapshot.selectedSpotifyProfile).toEqual(
      expect.objectContaining({
        id: 'spotify_1',
        name: 'Artist',
      })
    );
    expect(payload.snapshot.dspItems).toEqual([
      expect.objectContaining({
        id: 'match_1',
        providerId: 'spotify',
        confidenceScore: 0.95,
        status: 'confirmed',
      }),
    ]);
    expect(payload.snapshot.socialItems).toEqual([
      expect.objectContaining({
        id: 'link_1',
        kind: 'link',
        confidence: 0.81,
      }),
      expect.objectContaining({
        id: 'suggestion_1',
        kind: 'suggestion',
        confidence: 0.67,
      }),
    ]);
    expect(payload.snapshot.releases).toEqual([
      expect.objectContaining({
        id: 'release_1',
        title: 'Latest Release',
      }),
    ]);
    expect(payload.snapshot.counts).toEqual({
      releaseCount: 12,
      activeSocialCount: 1,
      dspCount: 2,
    });
    expect(payload.snapshot.importState).toEqual({
      spotifyImportStatus: 'complete',
      releaseCount: 12,
      recordingCount: 1,
      activeSocialCount: 1,
      confirmedDspCount: 2,
      hasSpotifySelection: true,
      hasImportedReleases: true,
    });
    expect(payload.snapshot.readiness).toEqual({
      phase: 'ready',
      canProceedToDashboard: true,
      blockingReason: null,
    });
    expect(payload.snapshot.hasPendingDiscoveryJob).toBe(true);
    expect(mockIsActiveDiscoveryJob).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' }),
      new Date('2025-01-02T00:00:00.000Z'),
      true
    );
  });

  it('returns 500 and captures unexpected errors', async () => {
    const discoveryError = new Error('database down');
    mockDbSelect.mockImplementationOnce(() => {
      throw discoveryError;
    });

    const { GET } = await import('@/app/api/onboarding/discovery/route');
    const response = await GET(
      new Request(
        `http://localhost/api/onboarding/discovery?profileId=${validProfileId}`
      )
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Internal server error',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Onboarding discovery fetch failed',
      discoveryError,
      expect.objectContaining({ route: '/api/onboarding/discovery' })
    );
  });
});
