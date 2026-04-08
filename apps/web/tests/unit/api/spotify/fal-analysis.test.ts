import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCacheQuery = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());
const mockGetSpotifyArtist = vi.hoisted(() => vi.fn());
const mockSearchSpotifyArtists = vi.hoisted(() => vi.fn());
const mockIsSpotifyAvailable = vi.hoisted(() => vi.fn());
const cacheOutcome = vi.hoisted(() => ({
  state: 'none' as 'none' | 'resolved' | 'threw',
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/db/cache', () => ({
  cacheQuery: mockCacheQuery,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mockServerFetch,
}));

vi.mock('@/lib/spotify/client', () => ({
  getSpotifyArtist: mockGetSpotifyArtist,
  searchSpotifyArtists: mockSearchSpotifyArtists,
  isSpotifyAvailable: mockIsSpotifyAvailable,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { GET } from '@/app/api/spotify/fal-analysis/route';

describe('GET /api/spotify/fal-analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheOutcome.state = 'none';

    mockGetCachedAuth.mockResolvedValue({ userId: 'admin-user' });
    mockGetCurrentUserEntitlements.mockResolvedValue({ isAdmin: true });
    mockIsSpotifyAvailable.mockReturnValue(true);
    mockCacheQuery.mockImplementation(
      async (_key: string, queryFn: () => Promise<unknown>) => {
        try {
          const result = await queryFn();
          cacheOutcome.state = 'resolved';
          return result;
        } catch (error) {
          cacheOutcome.state = 'threw';
          throw error;
        }
      }
    );

    mockGetSpotifyArtist.mockImplementation(async (artistId: string) => {
      if (artistId === '1234567890123456789012') {
        return {
          spotifyId: artistId,
          name: 'Target Artist',
          bio: null,
          imageUrl: null,
          genres: ['indie pop'],
          followerCount: 1000,
          popularity: 40,
          externalUrls: {},
        };
      }

      if (artistId === 'resolved-neighbour') {
        return {
          spotifyId: artistId,
          name: 'Bigger Artist',
          bio: null,
          imageUrl: null,
          genres: ['indie pop'],
          followerCount: 5000,
          popularity: 55,
          externalUrls: {},
        };
      }

      return null;
    });

    mockSearchSpotifyArtists.mockResolvedValue([
      {
        spotifyId: 'resolved-neighbour',
        name: 'Bigger Artist',
        imageUrl: null,
        followerCount: 5000,
        popularity: 55,
      },
    ]);
  });

  it('returns a ready report when related artists resolve successfully', async () => {
    mockServerFetch.mockResolvedValue(
      new Response(
        '<html><script>{"name":"Bigger Artist","@type":"MusicGroup"}</script></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/spotify/fal-analysis?artistId=1234567890123456789012'
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ready');
    expect(data.healthScore).toBe(100);
    expect(data.attemptedNeighbourCount).toBe(1);
    expect(data.resolvedNeighbourCount).toBe(1);
    expect(cacheOutcome.state).toBe('resolved');
  });

  it('returns unavailable without caching when Spotify serves an error page', async () => {
    mockServerFetch.mockResolvedValue(
      new Response(
        '<html><head><title>Page not available</title></head><body><h1>Page not available</h1></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/spotify/fal-analysis?artistId=1234567890123456789012'
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('unavailable');
    expect(data.verdict.label).toBe('Unavailable');
    expect(data.healthScore).toBeUndefined();
    expect(cacheOutcome.state).toBe('threw');
  });

  it('tracks artist fetch failures separately from search misses', async () => {
    mockServerFetch.mockResolvedValue(
      new Response(
        '<html><script>{"name":"Bigger Artist","@type":"MusicGroup"}</script><script>{"name":"Missing Details Artist","@type":"MusicGroup"}</script></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      )
    );

    mockSearchSpotifyArtists.mockImplementation(async (name: string) => {
      if (name === 'Missing Details Artist') {
        return [
          {
            spotifyId: 'missing-details',
            name,
            imageUrl: null,
            followerCount: 2000,
            popularity: 35,
          },
        ];
      }

      return [
        {
          spotifyId: 'resolved-neighbour',
          name,
          imageUrl: null,
          followerCount: 5000,
          popularity: 55,
        },
      ];
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/spotify/fal-analysis?artistId=1234567890123456789012'
      )
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ready');
    expect(data.attemptedNeighbourCount).toBe(2);
    expect(data.resolvedNeighbourCount).toBe(1);
    expect(data.warnings).toContain(
      '1 related artist matched in Spotify search but could not be loaded fully.'
    );
  });

  it('returns 400 for an invalid artist ID', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/spotify/fal-analysis?artistId=bad')
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid Spotify artist ID format');
  });
});
