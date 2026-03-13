'use server';

/**
 * Spotify Playlist Server Actions
 *
 * Server action for extracting unique artists from a Spotify playlist.
 * Follows the same security patterns as spotify.ts:
 *
 * 1. Authentication check
 * 2. Rate limiting
 * 3. Input validation with Zod
 * 4. Sanitized output
 */

import { auth } from '@clerk/nextjs/server';
import { captureError } from '@/lib/error-tracking';
import {
  handleIngestError,
  rateLimitedError,
  unauthorizedError,
  validationError,
} from '@/lib/errors/ingest';
import { checkSpotifySearchRateLimit } from '@/lib/rate-limit';
import { spotifyClient } from '@/lib/spotify';
import { type SanitizedArtist } from '@/lib/spotify/sanitize';
import { playlistExtractionSchema } from '@/lib/validation/schemas/spotify';

import { type SpotifyActionResult } from './spotify';

// ============================================================================
// Extract Playlist Artists
// ============================================================================

/**
 * Extract all unique artists from a Spotify playlist.
 *
 * Accepts a playlist URL or ID, fetches all tracks via pagination,
 * deduplicates artist IDs, and returns enriched artist metadata.
 *
 * Security:
 * - Requires authentication
 * - Rate limited per user
 * - Input validated with Zod
 * - Output sanitized
 *
 * @param input - Object with playlistInput (URL or ID)
 * @returns Deduplicated array of sanitized artist data
 */
export async function extractPlaylistArtists(
  input: unknown
): Promise<SpotifyActionResult<SanitizedArtist[]>> {
  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      throw unauthorizedError();
    }

    // 2. Rate limit
    const rateLimitResult = await checkSpotifySearchRateLimit(userId);
    if (!rateLimitResult.success) {
      throw rateLimitedError(
        rateLimitResult.reset
          ? Math.ceil((rateLimitResult.reset.getTime() - Date.now()) / 1000)
          : undefined
      );
    }

    // 3. Validate input
    const parsed = playlistExtractionSchema.safeParse(input);
    if (!parsed.success) {
      throw validationError(
        parsed.error.issues[0]?.message || 'Invalid playlist input',
        'INVALID_QUERY'
      );
    }

    // 4. Fetch unique artist IDs from playlist tracks
    const artistIds = await spotifyClient.getPlaylistArtistIds(
      parsed.data.playlistId
    );

    if (artistIds.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // 5. Enrich with full artist data (handles batching in chunks of 50)
    const artists = await spotifyClient.getArtists(artistIds);

    return {
      success: true,
      data: artists,
    };
  } catch (error) {
    await captureError('extractPlaylistArtists failed', error, {
      route: 'spotify-playlist',
    });
    const handled = handleIngestError(error, {
      action: 'extractPlaylistArtists',
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
