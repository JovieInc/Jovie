import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLoadDecryptedToken,
  mockStoreTokens,
  mockWithRefreshLock,
  mockServerFetch,
} = vi.hoisted(() => ({
  mockLoadDecryptedToken: vi.fn(),
  mockStoreTokens: vi.fn(),
  mockWithRefreshLock: vi.fn(),
  mockServerFetch: vi.fn(),
}));

vi.mock('@/lib/connectors/token-vault', () => ({
  loadDecryptedToken: mockLoadDecryptedToken,
  storeTokens: mockStoreTokens,
  withRefreshLock: mockWithRefreshLock,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mockServerFetch,
}));

describe('spotify connector access token', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'client-id');
    vi.stubEnv('SPOTIFY_CLIENT_SECRET', 'client-secret');
    mockStoreTokens.mockResolvedValue(undefined);
    mockWithRefreshLock.mockImplementation(
      (_id: string, fn: () => Promise<unknown>) => fn()
    );
  });

  it('returns the stored token when it is still fresh', async () => {
    mockLoadDecryptedToken.mockResolvedValue({
      accessToken: 'stored-token',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const { loadFreshSpotifyAccessToken } = await import(
      '@/lib/connectors/spotify/access-token'
    );

    await expect(loadFreshSpotifyAccessToken('conn_1')).resolves.toBe(
      'stored-token'
    );
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and persists a rotated refresh token', async () => {
    mockLoadDecryptedToken.mockResolvedValue({
      accessToken: 'stale-token',
      refreshToken: 'refresh-1',
      expiresAt: new Date(Date.now() - 1000),
    });
    mockServerFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'fresh-token',
        refresh_token: 'refresh-2',
        expires_in: 3600,
      }),
    });

    const { loadFreshSpotifyAccessToken } = await import(
      '@/lib/connectors/spotify/access-token'
    );

    await expect(loadFreshSpotifyAccessToken('conn_1')).resolves.toBe(
      'fresh-token'
    );
    expect(mockStoreTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorAccountId: 'conn_1',
        accessToken: 'fresh-token',
        refreshToken: 'refresh-2',
      })
    );
    const [, request] = mockServerFetch.mock.calls[0];
    expect(request.headers.Authorization).toMatch(/^Basic /);
    expect(request.body).toContain('grant_type=refresh_token');
  });

  it('returns null when the account has no refresh token', async () => {
    mockLoadDecryptedToken.mockResolvedValue({
      accessToken: 'stale-token',
      refreshToken: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const { loadFreshSpotifyAccessToken } = await import(
      '@/lib/connectors/spotify/access-token'
    );

    await expect(loadFreshSpotifyAccessToken('conn_1')).resolves.toBeNull();
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('returns null when the provider rejects the refresh', async () => {
    mockLoadDecryptedToken.mockResolvedValue({
      accessToken: 'stale-token',
      refreshToken: 'refresh-1',
      expiresAt: new Date(Date.now() - 1000),
    });
    mockServerFetch.mockResolvedValue({ ok: false, status: 400 });

    const { loadFreshSpotifyAccessToken } = await import(
      '@/lib/connectors/spotify/access-token'
    );

    await expect(loadFreshSpotifyAccessToken('conn_1')).resolves.toBeNull();
    expect(mockStoreTokens).not.toHaveBeenCalled();
  });
});
