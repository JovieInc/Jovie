'use server';

/**
 * Spotify Server Actions
 *
 * Hardened server actions for Spotify ingest operations.
 * All actions follow these security patterns:
 *
 * 1. Authentication check (before any processing)
 * 2. Rate limiting (before validation to prevent DoS)
 * 3. Input validation with Zod
 * 4. Idempotency for mutating operations
 * 5. Audit logging for security-sensitive operations
 * 6. Sanitized output
 *
 * @see /docs/spotify-ingest-hardening.md
 */

import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { logSearchEvent, logSearchRateLimited } from '@/lib/audit/ingest';
import { captureError } from '@/lib/error-tracking';
import {
  handleIngestError,
  rateLimitedError,
  unauthorizedError,
  validationError,
} from '@/lib/errors/ingest';
import {
  checkSpotifyPublicSearchRateLimit,
  checkSpotifySearchRateLimit,
} from '@/lib/rate-limit';
import { type SearchArtistResult, spotifyClient } from '@/lib/spotify/client';
import { type SanitizedArtist } from '@/lib/spotify/sanitize';
import {
  artistSearchSchema,
  spotifyArtistIdSchema,
} from '@/lib/validation/schemas/spotify';

// ============================================================================
// Types
// ============================================================================

/**
 * Standard result type for Spotify actions.
 */
export interface SpotifyActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  retryable?: boolean;
  retryAfter?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get client IP from headers for rate limiting.
 */
async function getClientIpFromHeaders(): Promise<string> {
  const headersList = await headers();

  // Priority: CF > Real IP > Forwarded
  const cfConnectingIp = headersList.get('cf-connecting-ip');
  const xRealIp = headersList.get('x-real-ip');
  const xForwardedFor = headersList.get('x-forwarded-for');

  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();

  return 'unknown';
}

// ============================================================================
// Search Artists (Authenticated)
// ============================================================================

/**
 * Search for artists on Spotify (authenticated users).
 *
 * Security:
 * - Requires authentication
 * - Rate limited per user (30 req/min)
 * - Input validated with Zod
 * - Output sanitized
 *
 * @param input - Search input (validated with artistSearchSchema)
 * @returns Sanitized search results
 */
export async function searchArtists(
  input: unknown
): Promise<SpotifyActionResult<SearchArtistResult[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      throw unauthorizedError();
    }

    // 2. Rate limit (before validation to prevent DoS)
    const rateLimitResult = await checkSpotifySearchRateLimit(userId);
    if (!rateLimitResult.success) {
      await logSearchRateLimited(userId, await getClientIpFromHeaders());
      throw rateLimitedError(
        rateLimitResult.reset
          ? Math.ceil((rateLimitResult.reset.getTime() - Date.now()) / 1000)
          : undefined
      );
    }

    // 3. Validate input
    const parsed = artistSearchSchema.safeParse(input);
    if (!parsed.success) {
      throw validationError(
        parsed.error.issues[0]?.message || 'Invalid search input',
        'INVALID_QUERY'
      );
    }

    // 4. Execute search
    const results = await spotifyClient.searchArtists(
      parsed.data.query,
      parsed.data.limit,
      parsed.data.offset
    );

    // 5. Log and return (results already sanitized by client)
    await logSearchEvent(userId, parsed.data.query, results.length);

    return {
      success: true,
      data: results,
    };
  } catch (error) {
    await captureError('searchArtists failed', error, { route: 'spotify' });
    const handled = handleIngestError(error, { action: 'searchArtists' });
    return {
      success: false,
      error: handled.error,
      code: handled.code,
      retryable: handled.retryable,
      retryAfter: handled.retryAfter,
    };
  }
}

// ============================================================================
// Search Artists (Public/Unauthenticated)
// ============================================================================

/**
 * Search for artists on Spotify (public endpoint).
 *
 * Security:
 * - Does NOT require authentication
 * - Rate limited per IP (10 req/min - stricter than authenticated)
 * - Input validated with Zod
 * - Output sanitized
 *
 * @param input - Search input (validated with artistSearchSchema)
 * @returns Sanitized search results
 */
export async function searchArtistsPublic(
  input: unknown
): Promise<SpotifyActionResult<SearchArtistResult[]>> {
  try {
    // 1. Get client IP for rate limiting
    const ip = await getClientIpFromHeaders();

    // 2. Rate limit by IP (before validation to prevent DoS)
    const rateLimitResult = await checkSpotifyPublicSearchRateLimit(ip);
    if (!rateLimitResult.success) {
      await logSearchRateLimited(undefined, ip);
      throw rateLimitedError(
        rateLimitResult.reset
          ? Math.ceil((rateLimitResult.reset.getTime() - Date.now()) / 1000)
          : undefined
      );
    }

    // 3. Validate input
    const parsed = artistSearchSchema.safeParse(input);
    if (!parsed.success) {
      throw validationError(
        parsed.error.issues[0]?.message || 'Invalid search input',
        'INVALID_QUERY'
      );
    }

    // 4. Execute search
    const results = await spotifyClient.searchArtists(
      parsed.data.query,
      parsed.data.limit,
      parsed.data.offset
    );

    // 5. Log and return (results already sanitized by client)
    await logSearchEvent(undefined, parsed.data.query, results.length);

    return {
      success: true,
      data: results,
    };
  } catch (error) {
    await captureError('searchArtistsPublic failed', error, {
      route: 'spotify',
    });
    const handled = handleIngestError(error, { action: 'searchArtistsPublic' });
    return {
      success: false,
      error: handled.error,
      code: handled.code,
      retryable: handled.retryable,
      retryAfter: handled.retryAfter,
    };
  }
}

// ============================================================================
// Get Artist Details
// ============================================================================

/**
 * Get artist details from Spotify.
 *
 * Security:
 * - Requires authentication
 * - Rate limited per user
 * - Spotify ID validated
 * - Output sanitized
 *
 * @param spotifyArtistId - Spotify artist ID
 * @returns Sanitized artist data
 */
export async function getArtist(
  spotifyArtistId: unknown
): Promise<SpotifyActionResult<SanitizedArtist>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      throw unauthorizedError();
    }

    // 2. Rate limit
    const rateLimitResult = await checkSpotifySearchRateLimit(userId);
    if (!rateLimitResult.success) {
      throw rateLimitedError();
    }

    // 3. Validate Spotify ID
    const parsed = spotifyArtistIdSchema.safeParse(spotifyArtistId);
    if (!parsed.success) {
      throw validationError('Invalid Spotify artist ID', 'INVALID_SPOTIFY_ID');
    }

    // 4. Fetch artist (already sanitized by client)
    const artist = await spotifyClient.getArtist(parsed.data);

    return {
      success: true,
      data: artist,
    };
  } catch (error) {
    await captureError('getArtist failed', error, { route: 'spotify' });
    const handled = handleIngestError(error, {
      action: 'getArtist',
      spotifyArtistId,
    });
    return {
      success: false,
      error: handled.error,
      code: handled.code,
      retryable: handled.retryable,
      retryAfter: handled.retryAfter,
    };
  }
}

// ============================================================================
// Check Artist Exists
// ============================================================================

/**
 * Check if an artist exists on Spotify.
 *
 * Security:
 * - Requires authentication
 * - Rate limited per user
 * - Spotify ID validated
 *
 * @param spotifyArtistId - Spotify artist ID
 * @returns Whether the artist exists
 */
export async function checkArtistExists(
  spotifyArtistId: unknown
): Promise<SpotifyActionResult<boolean>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      throw unauthorizedError();
    }

    // 2. Rate limit
    const rateLimitResult = await checkSpotifySearchRateLimit(userId);
    if (!rateLimitResult.success) {
      throw rateLimitedError();
    }

    // 3. Validate Spotify ID
    const parsed = spotifyArtistIdSchema.safeParse(spotifyArtistId);
    if (!parsed.success) {
      throw validationError('Invalid Spotify artist ID', 'INVALID_SPOTIFY_ID');
    }

    // 4. Check existence
    const exists = await spotifyClient.artistExists(parsed.data);

    return {
      success: true,
      data: exists,
    };
  } catch (error) {
    await captureError('checkArtistExists failed', error, { route: 'spotify' });
    const handled = handleIngestError(error, {
      action: 'checkArtistExists',
      spotifyArtistId,
    });
    return {
      success: false,
      error: handled.error,
      code: handled.code,
      retryable: handled.retryable,
      retryAfter: handled.retryAfter,
    };
  }
}
