import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClerkClient, mockGetPlaylistSpotifyClerkUserId } = vi.hoisted(
  () => ({
    mockClerkClient: vi.fn(),
    mockGetPlaylistSpotifyClerkUserId: vi.fn(),
  })
);

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mockClerkClient,
}));

vi.mock('@/lib/admin/platform-connections', () => ({
  getPlaylistSpotifyClerkUserId: mockGetPlaylistSpotifyClerkUserId,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

describe('jovie Spotify account', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('gets a token for an explicit Clerk user', async () => {
    mockClerkClient.mockResolvedValue({
      users: {
        getUserOauthAccessToken: vi.fn().mockResolvedValue({
          data: [{ token: 'spotify-token' }],
        }),
      },
    });

    const { getSpotifyTokenForClerkUser } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getSpotifyTokenForClerkUser('user_1')).resolves.toBe(
      'spotify-token'
    );
  });

  it('throws when a Clerk user has no Spotify OAuth token', async () => {
    mockClerkClient.mockResolvedValue({
      users: {
        getUserOauthAccessToken: vi.fn().mockResolvedValue({ data: [] }),
      },
    });

    const { getSpotifyTokenForClerkUser, SpotifyAuthError } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getSpotifyTokenForClerkUser('user_1')).rejects.toBeInstanceOf(
      SpotifyAuthError
    );
  });

  it('uses the DB configured publisher before the env fallback', async () => {
    mockGetPlaylistSpotifyClerkUserId.mockResolvedValue('db_user');
    const getToken = vi
      .fn()
      .mockResolvedValue({ data: [{ token: 'db-token' }] });
    mockClerkClient.mockResolvedValue({
      users: { getUserOauthAccessToken: getToken },
    });
    vi.stubEnv('JOVIE_SYSTEM_CLERK_USER_ID', 'env_user');

    const { getJovieSpotifyToken } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getJovieSpotifyToken()).resolves.toBe('db-token');
    expect(getToken).toHaveBeenCalledWith('db_user', 'oauth_spotify');
  });

  it('falls back to env when DB has no publisher configured', async () => {
    mockGetPlaylistSpotifyClerkUserId.mockResolvedValue(null);
    const getToken = vi
      .fn()
      .mockResolvedValue({ data: [{ token: 'env-token' }] });
    mockClerkClient.mockResolvedValue({
      users: { getUserOauthAccessToken: getToken },
    });
    vi.stubEnv('JOVIE_SYSTEM_CLERK_USER_ID', 'env_user');

    const { getJovieSpotifyToken } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getJovieSpotifyToken()).resolves.toBe('env-token');
    expect(getToken).toHaveBeenCalledWith('env_user', 'oauth_spotify');
  });

  it('falls back to env when the DB lookup throws', async () => {
    mockGetPlaylistSpotifyClerkUserId.mockRejectedValue(
      new Error('settings unavailable')
    );
    const getToken = vi
      .fn()
      .mockResolvedValue({ data: [{ token: 'env-token' }] });
    mockClerkClient.mockResolvedValue({
      users: { getUserOauthAccessToken: getToken },
    });
    vi.stubEnv('JOVIE_SYSTEM_CLERK_USER_ID', 'env_user');

    const { getJovieSpotifyToken } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getJovieSpotifyToken()).resolves.toBe('env-token');
    expect(getToken).toHaveBeenCalledWith('env_user', 'oauth_spotify');
  });

  it('throws a clear error when no publisher is configured', async () => {
    mockGetPlaylistSpotifyClerkUserId.mockResolvedValue(null);

    const { getJovieSpotifyToken } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getJovieSpotifyToken()).rejects.toThrow(
      'Playlist Spotify publisher is not configured'
    );
  });
});
