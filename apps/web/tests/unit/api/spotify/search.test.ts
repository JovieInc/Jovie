import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockSpotifySearch = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/spotify/client', () => ({
  spotifyApi: {
    search: mockSpotifySearch,
  },
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue(false),
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitStatus: vi.fn().mockReturnValue({
    limit: 100,
    remaining: 99,
    resetTime: Date.now() + 60000,
  }),
}));

describe('GET /api/spotify/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/spotify/search/route');
    const request = new NextRequest(
      'http://localhost/api/spotify/search?q=test'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when query is missing', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    const { GET } = await import('@/app/api/spotify/search/route');
    const request = new NextRequest('http://localhost/api/spotify/search');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('query');
  });

  it('returns search results for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSpotifySearch.mockResolvedValue({
      artists: {
        items: [{ id: 'artist_1', name: 'Artist One', images: [] }],
      },
    });

    const { GET } = await import('@/app/api/spotify/search/route');
    const request = new NextRequest(
      'http://localhost/api/spotify/search?q=artist'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeDefined();
  });
});
