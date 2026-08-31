import 'server-only';

import {
  loadDecryptedToken,
  storeTokens,
  withRefreshLock,
} from '@/lib/connectors/token-vault';
import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';

const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

interface RefreshResponse {
  readonly access_token: string;
  readonly expires_in: number;
}

interface RefreshErrorResponse {
  readonly error?: string;
}

export class GoogleAccessTokenRefreshError extends Error {
  readonly status: number;
  readonly providerError: string | null;

  constructor(status: number, providerError: string | null) {
    super(`Google OAuth token refresh failed with status ${status}`);
    this.name = 'GoogleAccessTokenRefreshError';
    this.status = status;
    this.providerError = providerError;
  }
}

export async function loadFreshGoogleAccessToken(
  connectorAccountId: string
): Promise<string | null> {
  const current = await loadDecryptedToken(connectorAccountId);
  if (!current) return null;
  if (current.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) {
    return current.accessToken;
  }
  if (!current.refreshToken) return null;

  return withRefreshLock(connectorAccountId, async () => {
    const reloaded = await loadDecryptedToken(connectorAccountId);
    if (!reloaded) return null;
    if (reloaded.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) {
      return reloaded.accessToken;
    }
    if (!reloaded.refreshToken) return null;

    const response = await serverFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        refresh_token: reloaded.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      timeoutMs: 10_000,
      context: 'Google OAuth token refresh',
    });
    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => null)) as RefreshErrorResponse | null;
      const providerError =
        typeof payload?.error === 'string' ? payload.error : null;
      if (providerError === 'invalid_grant') return null;
      throw new GoogleAccessTokenRefreshError(response.status, providerError);
    }
    const refreshed = (await response.json()) as RefreshResponse;
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await storeTokens({
      connectorAccountId,
      accessToken: refreshed.access_token,
      refreshToken: reloaded.refreshToken,
      expiresAt,
    });
    return refreshed.access_token;
  });
}
