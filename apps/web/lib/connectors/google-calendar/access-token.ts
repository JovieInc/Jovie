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
const isFresh = (token: { expiresAt: Date }) =>
  token.expiresAt.getTime() > Date.now() + EXPIRY_MARGIN_MS;

export async function loadFreshGoogleAccessToken(
  connectorAccountId: string
): Promise<string | null> {
  const current = await loadDecryptedToken(connectorAccountId);
  if (!current || isFresh(current)) return current?.accessToken ?? null;
  if (
    !current.refreshToken ||
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET
  )
    return null;

  return withRefreshLock(connectorAccountId, async () => {
    const reloaded = await loadDecryptedToken(connectorAccountId);
    if (!reloaded || isFresh(reloaded)) return reloaded?.accessToken ?? null;
    const refreshToken = reloaded.refreshToken;
    if (!refreshToken) return null;
    const response = await serverFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
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
    if (
      typeof payload?.access_token !== 'string' ||
      !payload.access_token ||
      typeof payload.expires_in !== 'number' ||
      !Number.isFinite(payload.expires_in) ||
      payload.expires_in < 0
    )
      return null;
    await storeTokens({
      connectorAccountId,
      accessToken: payload.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + payload.expires_in * 1000),
    });
    return payload.access_token;
  });
}
