import 'server-only';

import {
  loadDecryptedToken,
  storeTokens,
  withRefreshLock,
} from '@/lib/connectors/token-vault';
import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';

const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

type RefreshResponse = { access_token?: unknown; expires_in?: unknown };

export async function loadFreshGoogleAccessToken(
  connectorAccountId: string
): Promise<string | null> {
  const current = await loadDecryptedToken(connectorAccountId);
  if (!current) return null;
  if (current.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) {
    return current.accessToken;
  }

  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!current.refreshToken || !clientId || !clientSecret) {
    return null;
  }

  return withRefreshLock(connectorAccountId, async () => {
    const reloaded = await loadDecryptedToken(connectorAccountId);
    if (!reloaded) return null;
    if (reloaded.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS) {
      return reloaded.accessToken;
    }
    const refreshToken = reloaded.refreshToken;
    if (!refreshToken) return null;

    const response = await serverFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      timeoutMs: 10_000,
      context: 'Google OAuth token refresh',
    });
    if (!response.ok) return null;

    const payload = (await response
      .json()
      .catch(() => null)) as RefreshResponse | null;
    if (!payload) return null;

    const nextAccessToken = payload.access_token;
    const expiresIn = payload.expires_in;
    if (
      typeof nextAccessToken !== 'string' ||
      nextAccessToken.length === 0 ||
      typeof expiresIn !== 'number' ||
      !Number.isFinite(expiresIn) ||
      expiresIn < 0
    )
      return null;

    await storeTokens({
      connectorAccountId,
      accessToken: nextAccessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });
    return nextAccessToken;
  });
}
