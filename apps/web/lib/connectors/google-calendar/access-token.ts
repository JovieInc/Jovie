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
  if (
    !current.refreshToken ||
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET
  ) {
    return null;
  }

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
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: reloaded.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      timeoutMs: 10_000,
      context: 'Google OAuth token refresh',
    });
    if (!response.ok) return null;

    const payload = (await response
      .json()
      .catch(() => null)) as RefreshResponse | null;
    if (
      typeof payload?.access_token !== 'string' ||
      payload.access_token.length === 0 ||
      typeof payload.expires_in !== 'number' ||
      !Number.isFinite(payload.expires_in) ||
      payload.expires_in < 0
    )
      return null;

    await storeTokens({
      connectorAccountId,
      accessToken: payload.access_token,
      refreshToken: reloaded.refreshToken,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
    });
    return payload.access_token;
  });
}
