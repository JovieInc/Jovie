import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockSpotifySearchApiLimiterLimit = vi.hoisted(() => vi.fn());
const mockCreateRateLimitHeaders = vi.hoisted(() => vi.fn());

const mockIsSpotifyAvailable = vi.hoisted(() => vi.fn());
const mockSearchArtists = vi.hoisted(() => vi.fn());
const mockGetAlphabetResults = vi.hoisted(() => vi.fn());
const mockCacheQuery = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/spotify/client', () => ({
  isSpotifyAvailable: mockIsSpotifyAvailable,
  spotifyClient: {
    searchArtists: mockSearchArtists,
  },
}));

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

vi.mock('@/lib/rate-limit', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
    createRateLimitHeaders: mockCreateRateLimitHeaders,
    spotifySearchApiLimiter: {
      limit: mockSpotifySearchApiLimiterLimit,
    },
  };
});

import { GET } from '@/app/api/spotify/search/route';

describe('GET /api/spotify/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: null });
    mockCreateRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '29',
    });
    mockSpotifySearchApiLimiterLimit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(Date.now() + 60_000),
    });
    mockIsSpotifyAvailable.mockReturnValue(true);
    mockCacheQuery.mockImplementation(
      async (_key: string, queryFn: () => Promise<unknown>) => queryFn()
    );
    mockGetAlphabetResults.mockResolvedValue(null);
  });

  it('returns 400 when query is missing', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/spotify/search')
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('INVALID_QUERY');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockSpotifySearchApiLimiterLimit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });
    mockCreateRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '0',
    });

    const response = await GET(
      new NextRequest('http://localhost/api/spotify/search?q=artist')
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('returns empty array for single-letter query with no alphabet cache', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/spotify/search?q=a')
    );
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

    const response = await GET(
      new NextRequest('http://localhost/api/spotify/search?q=a')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(cachedResults);
    expect(mockGetAlphabetResults).toHaveBeenCalledWith('a');
    expect(mockSearchArtists).not.toHaveBeenCalled();
  });

  it('returns 503 when Spotify is unavailable', async () => {
    mockIsSpotifyAvailable.mockReturnValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/spotify/search?q=artist')
    );
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

    const response = await GET(
      new NextRequest('http://localhost/api/spotify/search?q=artist')
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0]).toMatchObject({
      id: 'artist_1',
      name: 'Artist One',
      popularity: 42,
      followers: 1234,
    });
  });

  it('uses cacheQuery for multi-character searches', async () => {
    mockSearchArtists.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost/api/spotify/search?q=test'));

    expect(mockCacheQuery).toHaveBeenCalledWith(
      'spotify:search:test:5',
      expect.any(Function),
      { ttlSeconds: 300, useRedis: true }
    );
  });

  it('uses user key when authenticated and IP key when anonymous', async () => {
    mockAuth.mockResolvedValueOnce({ userId: 'user_123' });

    await GET(new NextRequest('http://localhost/api/spotify/search?q=artist'));
    await GET(new NextRequest('http://localhost/api/spotify/search?q=artist'));

    expect(mockSpotifySearchApiLimiterLimit).toHaveBeenNthCalledWith(
      1,
      'user:user_123'
    );
    expect(mockSpotifySearchApiLimiterLimit).toHaveBeenNthCalledWith(
      2,
      'ip:127.0.0.1'
    );
  });
});
