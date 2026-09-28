import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetPlaylistSpotifyClerkUserId } = vi.hoisted(() => ({
  mockGetPlaylistSpotifyClerkUserId: vi.fn(),
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

  it('returns JOVIE_SPOTIFY_ACCESS_TOKEN when set', async () => {
    vi.stubEnv('JOVIE_SPOTIFY_ACCESS_TOKEN', 'spotify-token');

    const { getSpotifyTokenForClerkUser } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getSpotifyTokenForClerkUser('user_1')).resolves.toBe(
      'spotify-token'
    );
  });

  it('throws when no Spotify access token is configured after Better Auth cutover', async () => {
    const { getSpotifyTokenForClerkUser, SpotifyAuthError } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getSpotifyTokenForClerkUser('user_1')).rejects.toBeInstanceOf(
      SpotifyAuthError
    );
  });

  it('uses the DB configured publisher before the env fallback when token is set', async () => {
    mockGetPlaylistSpotifyClerkUserId.mockResolvedValue('db_user');
    vi.stubEnv('JOVIE_SPOTIFY_ACCESS_TOKEN', 'db-token');
    vi.stubEnv('JOVIE_SYSTEM_CLERK_USER_ID', 'env_user');

    const { getJovieSpotifyToken } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getJovieSpotifyToken()).resolves.toBe('db-token');
    expect(mockGetPlaylistSpotifyClerkUserId).toHaveBeenCalled();
  });

  it('falls back to env publisher id when DB has no publisher configured', async () => {
    mockGetPlaylistSpotifyClerkUserId.mockResolvedValue(null);
    vi.stubEnv('JOVIE_SPOTIFY_ACCESS_TOKEN', 'env-token');
    vi.stubEnv('JOVIE_SYSTEM_CLERK_USER_ID', 'env_user');

    const { getJovieSpotifyToken } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getJovieSpotifyToken()).resolves.toBe('env-token');
  });

  it('falls back to env publisher when the DB lookup throws', async () => {
    mockGetPlaylistSpotifyClerkUserId.mockRejectedValue(
      new Error('settings unavailable')
    );
    vi.stubEnv('JOVIE_SPOTIFY_ACCESS_TOKEN', 'env-token');
    vi.stubEnv('JOVIE_SYSTEM_CLERK_USER_ID', 'env_user');

    const { getJovieSpotifyToken } = await import(
      '@/lib/spotify/jovie-account'
    );

    await expect(getJovieSpotifyToken()).resolves.toBe('env-token');
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
