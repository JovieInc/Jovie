import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearchSpotifyArtists = vi.hoisted(() => vi.fn());

vi.mock('@/lib/spotify', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/spotify')>();
  return {
    ...actual,
    searchSpotifyArtists: mockSearchSpotifyArtists,
  };
});

describe('GET /api/spotify/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 400 when query is missing', async () => {
    const { GET } = await import('@/app/api/spotify/search/route');
    const request = new NextRequest('http://localhost/api/spotify/search');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query too short');
  });

  it('returns search results for authenticated user', async () => {
    mockSearchSpotifyArtists.mockResolvedValue([
      {
        id: 'artist_1',
        name: 'Artist One',
        images: [],
        popularity: 42,
        followers: { total: 1234 },
      },
    ]);

    const { GET } = await import('@/app/api/spotify/search/route');
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
});
