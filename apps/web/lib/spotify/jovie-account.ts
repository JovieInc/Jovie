/**
 * Jovie Spotify Account Manager
 *
 * Manages the Jovie-owned Spotify account for playlist creation.
 * Uses the canonical connector primitive (`connector_accounts` + shared
 * token vault) to retrieve access tokens for the configured publisher user.
 *
 * Token flow:
 *   connector_accounts (provider 'spotify') → token vault decrypt/refresh
 *   → Returns short-lived Spotify access token
 *   → Refresh handled by the connector refresh-lock path
 *
 * Required Spotify scopes (requested by the connector OAuth flow):
 *   - playlist-modify-public
 *   - playlist-read-private
 *   - ugc-image-upload
 */

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import {
  getPlaylistSpotifyClerkUserId,
  getSpotifyConnectorAccount,
} from '@/lib/admin/platform-connections';
import { loadFreshSpotifyAccessToken } from '@/lib/connectors/spotify/access-token';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { SPOTIFY_API_BASE, SPOTIFY_DEFAULT_TIMEOUT_MS } from './env';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Clerk user ID for the Jovie system account.
 * Set in Doppler as JOVIE_SYSTEM_CLERK_USER_ID.
 */
function getJovieSystemUserId(): string | null {
  return env.JOVIE_SYSTEM_CLERK_USER_ID?.trim() || null;
}

// ============================================================================
// Errors
// ============================================================================

export class SpotifyAuthError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

// ============================================================================
// Token Retrieval
// ============================================================================

export async function getSpotifyTokenForClerkUser(
  clerkUserId: string
): Promise<string> {
  const envToken = env.JOVIE_SPOTIFY_ACCESS_TOKEN?.trim();
  if (envToken) return envToken;

  try {
    const account = await getSpotifyConnectorAccount(clerkUserId);
    if (account && account.status !== 'disabled') {
      const accessToken = await loadFreshSpotifyAccessToken(account.id);
      if (accessToken) return accessToken;
    }
  } catch (error) {
    captureError('[Jovie Spotify] Connector token lookup failed', error, {
      userId: clerkUserId,
    });
  }

  const error = new SpotifyAuthError(
    'Spotify is not connected for this user. Connect Spotify via the connector OAuth flow.'
  );
  captureError('[Jovie Spotify] Token retrieval failed', error, {
    userId: clerkUserId,
  });
  Sentry.captureException(error, {
    tags: { component: 'jovie-spotify-account' },
    extra: { userId: clerkUserId },
  });
  throw error;
}

/**
 * Get a valid Spotify access token for the configured Jovie publisher account.
 * Throws SpotifyAuthError if the account is not linked or token retrieval fails.
 */
export async function getJovieSpotifyToken(): Promise<string> {
  let configuredUserId: string | null = null;
  try {
    configuredUserId = await getPlaylistSpotifyClerkUserId();
  } catch (error) {
    captureError('[Jovie Spotify] Failed to read configured publisher', error);
  }
  const userId = configuredUserId ?? getJovieSystemUserId();

  if (!userId) {
    throw new SpotifyAuthError(
      'Playlist Spotify publisher is not configured. Connect Spotify in Admin → Platform Connections.'
    );
  }

  return getSpotifyTokenForClerkUser(userId);
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Verify Spotify OAuth is valid for the Jovie system account.
 * Returns true if we can successfully retrieve a token.
 * Does not throw — returns false on failure and reports to Sentry.
 */
export async function checkJovieSpotifyHealth(): Promise<boolean> {
  try {
    const token = await getJovieSpotifyToken();
    // Validate token works by calling the current user endpoint
    const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(SPOTIFY_DEFAULT_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    Sentry.captureMessage('Jovie Spotify health check failed', {
      level: 'error',
      tags: { component: 'jovie-spotify-account' },
    });
    return false;
  }
}

/**
 * Get the Spotify user ID for the Jovie account.
 * Used to verify we're still operating on the correct account.
 */
export async function getJovieSpotifyUserId(): Promise<string> {
  const token = await getJovieSpotifyToken();
  const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SPOTIFY_DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new SpotifyApiError(
      'Failed to get Spotify user profile',
      response.status,
      '/me'
    );
  }

  const data: { id: string } = await response.json();
  return data.id;
}

// ============================================================================
// Authenticated API Helpers
// ============================================================================

/**
 * Make an authenticated request to the Spotify API using the Jovie account.
 */
export async function jovieSpotifyFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getJovieSpotifyToken();

  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(SPOTIFY_DEFAULT_TIMEOUT_MS),
  });

  if (response.status === 401) {
    Sentry.captureMessage('Jovie Spotify token expired mid-request', {
      level: 'error',
      tags: { component: 'jovie-spotify-account', endpoint },
    });
    throw new SpotifyAuthError('Spotify token expired during request');
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    captureError('[Jovie Spotify] Rate limited', null, {
      endpoint,
      retryAfter,
    });
    throw new SpotifyApiError(
      `Rate limited. Retry after ${retryAfter ?? 'unknown'}s`,
      429,
      endpoint
    );
  }

  return response;
}
