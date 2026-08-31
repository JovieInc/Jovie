import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDecryptedToken: vi.fn(),
  storeTokens: vi.fn(),
  withRefreshLock: vi.fn(
    async (_connectorAccountId: string, fn: () => Promise<string | null>) =>
      fn()
  ),
  serverFetch: vi.fn(),
}));

vi.mock('@/lib/connectors/token-vault', () => ({
  loadDecryptedToken: mocks.loadDecryptedToken,
  storeTokens: mocks.storeTokens,
  withRefreshLock: mocks.withRefreshLock,
}));
vi.mock('@/lib/env-server', () => ({
  env: {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  },
}));
vi.mock('@/lib/http/server-fetch', () => ({
  serverFetch: mocks.serverFetch,
}));

import {
  GoogleAccessTokenRefreshError,
  loadFreshGoogleAccessToken,
} from './access-token';

describe('loadFreshGoogleAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadDecryptedToken.mockResolvedValue({
      accessToken: 'old-access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(0),
    });
    mocks.serverFetch.mockResolvedValue(
      Response.json({ access_token: 'new-access-token', expires_in: 3600 })
    );
  });

  it('returns a still-fresh access token without refreshing', async () => {
    mocks.loadDecryptedToken.mockResolvedValueOnce({
      accessToken: 'fresh-access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(loadFreshGoogleAccessToken('account-1')).resolves.toBe(
      'fresh-access-token'
    );

    expect(mocks.withRefreshLock).not.toHaveBeenCalled();
    expect(mocks.serverFetch).not.toHaveBeenCalled();
  });

  it.each([
    'invalid_grant',
    'admin_policy_enforced',
  ])('treats %s as reauthorization', async providerError => {
    mocks.serverFetch.mockResolvedValueOnce(
      Response.json({ error: providerError }, { status: 400 })
    );

    await expect(loadFreshGoogleAccessToken('account-1')).resolves.toBeNull();

    expect(mocks.storeTokens).not.toHaveBeenCalled();
  });

  it('throws on transient token endpoint failures so callers can retry', async () => {
    mocks.serverFetch.mockResolvedValueOnce(
      Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
    );

    await expect(loadFreshGoogleAccessToken('account-1')).rejects.toMatchObject(
      {
        name: GoogleAccessTokenRefreshError.name,
        status: 503,
        providerError: 'temporarily_unavailable',
      }
    );

    expect(mocks.storeTokens).not.toHaveBeenCalled();
  });
});
