/**
 * Spotify Alphabet Pre-Cache
 *
 * Pre-caches the top 5 artists for each letter of the alphabet (a-z)
 * so that single-keystroke search results are near-instant.
 *
 * Data is warmed via the frequent cron job every 6 hours and stored
 * in the multi-layer cache (in-memory LRU + Redis).
 *
 * 26 letters × 5 artists = 130 entries, under 50KB in Redis.
 * Warm cycle: 26 sequential Spotify API calls with 100ms delays (~5s total).
 */

import 'server-only';

import type { SpotifyArtistResult } from '@/app/api/spotify/search/route';
import { cacheQuery } from '@/lib/db/cache';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { isSpotifyAvailable, spotifyClient } from '@/lib/spotify/client';
import { logger } from '@/lib/utils/logger';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const RESULTS_PER_LETTER = 5;
const FETCH_PER_LETTER = 10; // Fetch more, keep top 5 by popularity
const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6 hours
const CACHE_PREFIX = 'spotify:alphabet:';

function getAlphabetCacheKey(letter: string): string {
  return `${CACHE_PREFIX}${letter.toLowerCase()}`;
}

/**
 * Fetch top artists for a single letter from Spotify,
 * sorted by popularity and limited to the top 5.
 */
async function fetchTopArtistsForLetter(
  letter: string
): Promise<SpotifyArtistResult[]> {
  const artists = await spotifyClient.searchArtists(letter, FETCH_PER_LETTER);

  return [...artists]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, RESULTS_PER_LETTER)
    .map(artist => ({
      id: artist.spotifyId,
      name: artist.name,
      url: buildSpotifyArtistUrl(artist.spotifyId),
      imageUrl: artist.imageUrl ?? undefined,
      followers: artist.followerCount,
      popularity: artist.popularity,
      verified: undefined,
    }));
}

/**
 * Warm the alphabet cache for all 26 letters.
 * Processes sequentially with 100ms delays to respect Spotify rate limits.
 *
 * @returns Summary of how many letters succeeded/failed
 */
export async function warmAlphabetCache(): Promise<{
  success: number;
  failed: number;
  failedLetters: string[];
}> {
  if (!isSpotifyAvailable()) {
    logger.warn('[alphabet-cache] Spotify not available, skipping warm');
    return { success: 0, failed: 0, failedLetters: [] };
  }

  let success = 0;
  let failed = 0;
  const failedLetters: string[] = [];

  for (const letter of ALPHABET) {
    try {
      const results = await fetchTopArtistsForLetter(letter);

      // Write directly to the multi-layer cache with a long TTL
      await cacheQuery(getAlphabetCacheKey(letter), async () => results, {
        ttlSeconds: CACHE_TTL_SECONDS,
        useRedis: true,
      });

      success++;

      // Small delay between requests to avoid hitting Spotify rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      failed++;
      failedLetters.push(letter);
      logger.error(
        `[alphabet-cache] Failed to warm letter "${letter}":`,
        error
      );
    }
  }

  logger.info(
    `[alphabet-cache] Warm complete: ${success} succeeded, ${failed} failed`
  );

  return { success, failed, failedLetters };
}

/**
 * Get pre-cached results for a single letter.
 * Returns null on cache miss (caller should return empty results).
 *
 * This does NOT fetch from Spotify on miss — single-letter queries
 * without the pre-cache produce low-quality results.
 */
export async function getAlphabetResults(
  letter: string
): Promise<SpotifyArtistResult[] | null> {
  const key = getAlphabetCacheKey(letter);

  // Try reading from multi-layer cache without a fallback query.
  // cacheQuery always executes queryFn on miss, so we return null as the value
  // and check for it in the caller.
  const results = await cacheQuery<SpotifyArtistResult[] | null>(
    key,
    async () => null,
    { ttlSeconds: CACHE_TTL_SECONDS, useRedis: true }
  );

  return results;
}
