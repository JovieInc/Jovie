import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsSpotifyAvailable = vi.hoisted(() => vi.fn());
const mockSearchArtists = vi.hoisted(() => vi.fn());
const mockGetAlphabetResults = vi.hoisted(() => vi.fn());
const mockCacheQuery = vi.hoisted(() => vi.fn());

vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: mockIsSpotifyAvailable,
  spotifyClient: {
    searchArtists: mockSearchArtists,
  },
}));

// Mock dependencies that have side effects
vi.mock('@/lib/spotify/circuit-breaker', () => ({
  CircuitOpenError: class CircuitOpenError extends Error {
    stats = {};
  },
}));

vi.mock('@/app/api/spotify/search/helpers', () => ({
  applyVipBoost: vi.fn((results: unknown[]) => Promise.resolve(results)),
  parseLimit: vi.fn(
    (_param: string | null, defaultVal: number, _max: number) => defaultVal
  ),
}));

vi.mock('@/lib/spotify/alphabet-cache', () => ({
  getAlphabetResults: mockGetAlphabetResults,
}));

vi.mock('@/lib/db/cache', () => ({
  cacheQuery: mockCacheQuery,
}));

// Import once after mocks are set up
import { GET } from '@/app/api/spotify/search/route';

describe('GET /api/spotify/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to Spotify being available
    mockIsSpotifyAvailable.mockReturnValue(true);
    // Default: cacheQuery executes the queryFn
    mockCacheQuery.mockImplementation(
      async (_key: string, queryFn: () => Promise<unknown>) => queryFn()
    );
    // Default: no alphabet cache results
    mockGetAlphabetResults.mockResolvedValue(null);
  });

  it('returns 400 when query is missing', async () => {
    const request = new NextRequest('http://localhost/api/spotify/search');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('INVALID_QUERY');
  });

  it('returns empty array for single-letter query with no alphabet cache', async () => {
    mockGetAlphabetResults.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/spotify/search?q=a');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('returns alphabet cache results for single-letter query', async () => {
    const cachedResults = [
      {
        id: 'adele_id',
        name: 'Adele',
        url: 'https://open.spotify.com/artist/adele_id',
        popularity: 90,
        followers: 50000000,
      },
    ];
    mockGetAlphabetResults.mockResolvedValue(cachedResults);

    const request = new NextRequest('http://localhost/api/spotify/search?q=a');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(cachedResults);
    expect(mockGetAlphabetResults).toHaveBeenCalledWith('a');
    // Should NOT call Spotify directly for single-letter queries
    expect(mockSearchArtists).not.toHaveBeenCalled();
  });

  it('returns 503 when Spotify is unavailable', async () => {
    mockIsSpotifyAvailable.mockReturnValue(false);

    const request = new NextRequest(
      'http://localhost/api/spotify/search?q=artist'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.code).toBe('UNAVAILABLE');
  });

  it('returns search results for multi-character query', async () => {
    mockSearchArtists.mockResolvedValue([
      {
        spotifyId: 'artist_1',
        name: 'Artist One',
        imageUrl: null,
        popularity: 42,
        followerCount: 1234,
      },
    ]);

    const request = new NextRequest(
      'http://localhost/api/spotify/search?q=artist'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toMatchObject({
      id: 'artist_1',
      name: 'Artist One',
      popularity: 42,
      followers: 1234,
    });
    expect(data[0].url).toContain('open.spotify.com/artist/artist_1');
  });

  it('uses cacheQuery for multi-character searches', async () => {
    mockSearchArtists.mockResolvedValue([]);

    const request = new NextRequest(
      'http://localhost/api/spotify/search?q=test'
    );

    await GET(request);

    expect(mockCacheQuery).toHaveBeenCalledWith(
      'spotify:search:test:5',
      expect.any(Function),
      { ttlSeconds: 300, useRedis: true }
    );
  });
});
