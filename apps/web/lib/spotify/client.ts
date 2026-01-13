/**
 * Spotify Client Manager
 *
 * Provides a managed Spotify API client with:
 * - Automatic token refresh before expiry
 * - Rate limit handling
 * - Error mapping to IngestError types
 * - Data sanitization
 * - Circuit breaker for fault tolerance
 * - Retry logic with exponential backoff
 *
 * Security:
 * - Server-only module (cannot be imported in client code)
 * - Tokens are never exposed to client
 * - All responses are sanitized before return
 * - Circuit breaker prevents cascading failures
 */

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { type IngestErrorCode, spotifyApiError } from '@/lib/errors/ingest';
import { spotifyCircuitBreaker } from './circuit-breaker';
import {
  getSpotifyEnv,
  isSpotifyConfigured,
  SPOTIFY_ACCOUNTS_BASE,
  SPOTIFY_API_BASE,
  SPOTIFY_DEFAULT_TIMEOUT_MS,
  SPOTIFY_TOKEN_LIFETIME_MS,
  SPOTIFY_TOKEN_REFRESH_BUFFER_MS,
} from './env';
import { retryAsync, SPOTIFY_RETRY_CONFIG } from './retry';
import {
  type RawSpotifyArtist,
  type SanitizedArtist,
  sanitizeArtistData,
  sanitizeSearchResult,
} from './sanitize';

// ============================================================================
// Types
// ============================================================================

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifySearchResponse {
  artists: {
    items: RawSpotifyArtist[];
    total: number;
    offset: number;
    limit: number;
  };
}

interface SpotifyErrorResponse {
  error: {
    status: number;
    message: string;
  };
}

export interface SearchArtistResult {
  spotifyId: string;
  name: string;
  imageUrl: string | null;
  followerCount: number;
  popularity: number;
}

// ============================================================================
// Client Manager Class
// ============================================================================

/**
 * Managed Spotify API client with automatic token handling.
 */
class SpotifyClientManager {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private tokenRefreshPromise: Promise<string | null> | null = null;

  /**
   * Check if Spotify is configured and available.
   */
  isAvailable(): boolean {
    return isSpotifyConfigured();
  }

  /**
   * Get a valid access token, refreshing if needed.
   * Uses a promise cache to prevent duplicate refresh requests.
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const now = Date.now();

    // Check if current token is still valid (with buffer)
    if (
      this.accessToken &&
      now < this.tokenExpiresAt - SPOTIFY_TOKEN_REFRESH_BUFFER_MS
    ) {
      return this.accessToken;
    }

    // If a refresh is in progress, wait for it
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    // Start a new refresh
    this.tokenRefreshPromise = this.refreshToken();

    try {
      const token = await this.tokenRefreshPromise;
      return token;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  /**
   * Refresh the access token using client credentials flow.
   */
  private async refreshToken(): Promise<string | null> {
    const config = getSpotifyEnv();

    if (!config.isConfigured) {
      return null;
    }

    try {
      const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(SPOTIFY_DEFAULT_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.error(
          '[Spotify Client] Token refresh failed:',
          response.status
        );
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        return null;
      }

      const data: SpotifyTokenResponse = await response.json();

      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + SPOTIFY_TOKEN_LIFETIME_MS;

      return this.accessToken;
    } catch (error) {
      console.error('[Spotify Client] Token refresh error:', error);
      this.accessToken = null;
      this.tokenExpiresAt = 0;
      return null;
    }
  }

  /**
   * Make an authenticated request to the Spotify API.
   * Protected by circuit breaker and retry logic.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Check circuit breaker before attempting request
    if (!spotifyCircuitBreaker.canExecute()) {
      const stats = spotifyCircuitBreaker.getStats();
      Sentry.captureMessage('Spotify circuit breaker is open', {
        level: 'warning',
        extra: { stats, endpoint },
      });
      throw spotifyApiError(
        {
          reason: 'Service temporarily unavailable',
          circuitState: stats.state,
        },
        'SPOTIFY_UNAVAILABLE'
      );
    }

    const token = await this.getAccessToken();

    if (!token) {
      throw spotifyApiError(
        { reason: 'No access token available' },
        'SPOTIFY_UNAVAILABLE'
      );
    }

    const url = endpoint.startsWith('http')
      ? endpoint
      : `${SPOTIFY_API_BASE}${endpoint}`;

    // Execute with circuit breaker and retry logic
    return spotifyCircuitBreaker.execute(async () => {
      return Sentry.startSpan(
        { op: 'http.client', name: `Spotify API ${endpoint}` },
        async span => {
          span.setAttribute('spotify.endpoint', endpoint);

          const result = await retryAsync(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(
              () => controller.abort(),
              SPOTIFY_DEFAULT_TIMEOUT_MS
            );

            try {
              const response = await fetch(url, {
                ...options,
                headers: {
                  Authorization: `Bearer ${token}`,
                  ...options.headers,
                },
                signal: controller.signal,
              });

              // Handle error responses
              if (!response.ok) {
                const errorCode = this.mapStatusToErrorCode(response.status);
                span.setAttribute('spotify.status', response.status);
                span.setAttribute('spotify.error_code', errorCode);

                let errorDetails: unknown;
                try {
                  errorDetails =
                    (await response.json()) as SpotifyErrorResponse;
                } catch {
                  errorDetails = {
                    status: response.status,
                    statusText: response.statusText,
                  };
                }

                // Extract Retry-After for 429 responses
                const retryAfter = response.headers.get('Retry-After');
                const error = spotifyApiError(errorDetails, errorCode);
                if (retryAfter) {
                  // Type-safe way to attach retryAfter property
                  Object.assign(error, {
                    retryAfter: parseInt(retryAfter, 10),
                  });
                }

                throw error;
              }

              span.setAttribute('spotify.status', response.status);
              return response.json() as Promise<T>;
            } finally {
              clearTimeout(timeoutId);
            }
          }, SPOTIFY_RETRY_CONFIG);

          return result;
        }
      );
    });
  }

  /**
   * Map HTTP status codes to IngestError codes.
   */
  private mapStatusToErrorCode(
    status: number
  ): Extract<
    IngestErrorCode,
    | 'SPOTIFY_API_ERROR'
    | 'SPOTIFY_NOT_FOUND'
    | 'SPOTIFY_RATE_LIMITED'
    | 'SPOTIFY_UNAVAILABLE'
  > {
    switch (status) {
      case 404:
        return 'SPOTIFY_NOT_FOUND';
      case 429:
        return 'SPOTIFY_RATE_LIMITED';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'SPOTIFY_UNAVAILABLE';
      default:
        return 'SPOTIFY_API_ERROR';
    }
  }

  // ==========================================================================
  // Public API Methods
  // ==========================================================================

  /**
   * Search for artists by query.
   *
   * @param query - Search query (already validated)
   * @param limit - Maximum results (1-10)
   * @param offset - Pagination offset (0-100)
   * @returns Sanitized search results
   */
  async searchArtists(
    query: string,
    limit: number = 5,
    offset: number = 0
  ): Promise<SearchArtistResult[]> {
    const params = new URLSearchParams({
      q: query,
      type: 'artist',
      limit: String(Math.min(10, Math.max(1, limit))),
      offset: String(Math.min(100, Math.max(0, offset))),
    });

    const response = await this.request<SpotifySearchResponse>(
      `/search?${params}`
    );

    // Sanitize all results before returning
    return response.artists.items.map(sanitizeSearchResult);
  }

  /**
   * Get artist details by Spotify ID.
   *
   * @param artistId - Spotify artist ID (already validated)
   * @returns Sanitized artist data
   */
  async getArtist(artistId: string): Promise<SanitizedArtist> {
    const response = await this.request<RawSpotifyArtist>(
      `/artists/${artistId}`
    );

    // Sanitize before returning
    return sanitizeArtistData(response);
  }

  /**
   * Check if an artist exists on Spotify.
   *
   * @param artistId - Spotify artist ID (already validated)
   * @returns true if exists, false if not found
   * @throws IngestError for other API errors
   */
  async artistExists(artistId: string): Promise<boolean> {
    try {
      await this.request<RawSpotifyArtist>(`/artists/${artistId}`);
      return true;
    } catch (error) {
      // Check if it's a 404 error (not found)
      if (error instanceof Error && 'code' in error) {
        const ingestError = error as { code: IngestErrorCode };
        if (ingestError.code === 'SPOTIFY_NOT_FOUND') {
          return false;
        }
      }
      throw error;
    }
  }

  /**
   * Invalidate the cached token.
   * Use when you receive auth errors from Spotify.
   */
  invalidateToken(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global Spotify client manager instance.
 * Use this for all Spotify API operations.
 */
export const spotifyClient = new SpotifyClientManager();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if Spotify integration is available.
 */
export function isSpotifyAvailable(): boolean {
  return spotifyClient.isAvailable();
}

/**
 * Search for artists on Spotify.
 *
 * @param query - Search query
 * @param limit - Maximum results (default: 5)
 * @returns Sanitized search results or empty array if not available
 */
export async function searchSpotifyArtists(
  query: string,
  limit: number = 5
): Promise<SearchArtistResult[]> {
  if (!spotifyClient.isAvailable()) {
    console.warn('[Spotify] Not available - returning empty results');
    return [];
  }

  try {
    return await spotifyClient.searchArtists(query, limit);
  } catch (error) {
    console.error('[Spotify] Search failed:', error);
    return [];
  }
}

/**
 * Get artist details from Spotify.
 *
 * @param artistId - Spotify artist ID
 * @returns Sanitized artist data or null if not found/unavailable
 */
export async function getSpotifyArtist(
  artistId: string
): Promise<SanitizedArtist | null> {
  if (!spotifyClient.isAvailable()) {
    console.warn('[Spotify] Not available - returning null');
    return null;
  }

  try {
    return await spotifyClient.getArtist(artistId);
  } catch (error) {
    console.error('[Spotify] Get artist failed:', error);
    return null;
  }
}
