/**
 * Jovie Spotify Account Manager
 *
 * Manages the Jovie-owned Spotify account for playlist creation.
 * Uses Clerk OAuth to retrieve access tokens for the system account.
 *
 * Token flow:
 *   Clerk Backend API → getUserOauthAccessToken('oauth_spotify')
 *   → Returns short-lived Spotify access token
 *   → Clerk handles refresh automatically
 *
 * Required Clerk OAuth scopes (configured in Clerk Dashboard):
 *   - playlist-modify-public
 *   - playlist-read-private
 *   - ugc-image-upload
 */

import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { captureError } from '@/lib/error-tracking';
import { SPOTIFY_API_BASE, SPOTIFY_DEFAULT_TIMEOUT_MS } from './env';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Clerk user ID for the Jovie system account.
 * Set in Doppler as JOVIE_SYSTEM_CLERK_USER_ID.
 */
function getJovieSystemUserId(): string {
  const userId = process.env.JOVIE_SYSTEM_CLERK_USER_ID;
  if (!userId) {
    throw new Error(
      'JOVIE_SYSTEM_CLERK_USER_ID is not configured. ' +
        'Create a Clerk user for the Jovie system account and set this env var.'
    );
  }
  return userId;
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

/**
 * Get a valid Spotify access token for the Jovie system account via Clerk.
 * Throws SpotifyAuthError if the account is not linked or token retrieval fails.
 */
export async function getJovieSpotifyToken(): Promise<string> {
  const userId = getJovieSystemUserId();

  try {
    const clerk = await clerkClient();
    const tokens = await clerk.users.getUserOauthAccessToken(
      userId,
      'oauth_spotify'
    );

    if (!tokens.data || tokens.data.length === 0) {
      throw new SpotifyAuthError(
        'No Spotify account linked to the Jovie system user. ' +
          'Link Spotify via the admin Platform Connections page.'
      );
    }

    const token = tokens.data[0]?.token;
    if (!token) {
      throw new SpotifyAuthError(
        'Spotify OAuth token is empty. The account may need to be re-linked.'
      );
    }

    return token;
  } catch (error) {
    if (error instanceof SpotifyAuthError) throw error;

    const msg = error instanceof Error ? error.message : 'Unknown error';
    captureError('[Jovie Spotify] Token retrieval failed', error, { userId });
    Sentry.captureException(error, {
      tags: { component: 'jovie-spotify-account' },
      extra: { userId },
    });

    throw new SpotifyAuthError(`Failed to retrieve Spotify token: ${msg}`);
  }
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
