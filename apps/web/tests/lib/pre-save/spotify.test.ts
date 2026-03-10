import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockServerFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mockServerFetch,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    SPOTIFY_CLIENT_ID: 'client-id',
    SPOTIFY_CLIENT_SECRET: 'client-secret',
  },
}));

describe('pre-save spotify integration fetch bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies bounded timeout for code exchange', async () => {
    mockServerFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'token', expires_in: 3600 }),
        {
          status: 200,
        }
      )
    );

    const { exchangeSpotifyCode } = await import('@/lib/pre-save/spotify');
    await exchangeSpotifyCode({
      code: 'auth-code',
      redirectUri: 'https://jovie.test/api/pre-save/spotify/callback',
    });

    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({ method: 'POST', timeoutMs: 10_000 })
    );
  });

  it('applies bounded timeout for refresh, /me, and save requests', async () => {
    mockServerFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'new-token', expires_in: 3600 }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'fan-123', email: 'fan@example.com' }),
          {
            status: 200,
          }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const {
      fetchSpotifyMe,
      refreshSpotifyAccessToken,
      saveReleaseToSpotifyLibrary,
    } = await import('@/lib/pre-save/spotify');

    await refreshSpotifyAccessToken('refresh-token');
    await fetchSpotifyMe('access-token');
    await saveReleaseToSpotifyLibrary({
      accessToken: 'access-token',
      spotifyReleaseId: 'release-1',
      isTrack: false,
    });

    expect(mockServerFetch).toHaveBeenNthCalledWith(
      1,
      'https://accounts.spotify.com/api/token',
      expect.objectContaining({ timeoutMs: 10_000 })
    );
    expect(mockServerFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.spotify.com/v1/me',
      expect.objectContaining({ timeoutMs: 10_000 })
    );
    expect(mockServerFetch).toHaveBeenNthCalledWith(
      3,
      'https://api.spotify.com/v1/me/albums?ids=release-1',
      expect.objectContaining({ method: 'PUT', timeoutMs: 10_000 })
    );
  });
});
