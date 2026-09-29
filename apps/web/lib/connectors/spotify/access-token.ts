import 'server-only';

import {
  loadDecryptedToken,
  storeTokens,
  withRefreshLock,
} from '@/lib/connectors/token-vault';
import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';
import { SPOTIFY_ACCOUNTS_BASE } from '@/lib/spotify/env';

const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

type RefreshResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

function spotifyCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function refreshSpotifyTokens(input: {
  readonly connectorAccountId: string;
  readonly refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string } | null> {
  const credentials = spotifyCredentials();
  if (!credentials) return null;

  const response = await serverFetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${credentials.clientId}:${credentials.clientSecret}`
      ).toString('base64')}`,
    },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    timeoutMs: 10_000,
    context: 'Spotify OAuth token refresh',
  });
  if (!response.ok) return null;

  const payload = (await response
    .json()
    .catch(() => null)) as RefreshResponse | null;
  if (!payload) return null;

  const accessToken = payload.access_token;
  const expiresIn = payload.expires_in;
  if (
    typeof accessToken !== 'string' ||
    accessToken.length === 0 ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn < 0
  )
    return null;

  // Spotify rotates refresh tokens — persist the new one when present.
  const refreshToken =
    typeof payload.refresh_token === 'string' && payload.refresh_token.length
      ? payload.refresh_token
      : input.refreshToken;

  await storeTokens({
    connectorAccountId: input.connectorAccountId,
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  });
  return { accessToken, refreshToken };
}

/**
 * Returns a valid Spotify access token for a connector account, refreshing via
 * the shared token vault + CAS refresh lock when the stored token is expiring.
 * Returns null when no usable token exists (caller should surface reauth).
 */
export async function loadFreshSpotifyAccessToken(
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

    const refreshed = await refreshSpotifyTokens({
      connectorAccountId,
      refreshToken: reloaded.refreshToken,
    });
    return refreshed?.accessToken ?? null;
  });
}
