/**
 * Spotify Artist Blacklist
 *
 * Permanently blocked Spotify artist IDs that must never appear in
 * search results, be claimable, or be used for profile enrichment.
 *
 * This is a founder identity protection mechanism — not a user feature.
 */

import { logger } from '@/lib/utils/logger';

/** Tim White (founder) — the ONLY allowed Tim White Spotify ID */
export const TIM_WHITE_SPOTIFY_ID = '4Uwpa6zW3zzCSQvooQNksm';

/**
 * Blocked Spotify artist IDs.
 * These are filtered from ALL Spotify results platform-wide.
 *
 * // Last refreshed: 2026-03-20
 */
export const SPOTIFY_BLACKLISTED_IDS = new Set<string>([
  // "Tim White" exact name matches
  '59NJtiWq8nISIJjDtITQyt', // Tim White (gospel, 278 followers)
  '3EawsIJlB0zYAss7QaKeBi', // Tim White (bluegrass, 265 followers)
  '5zRK1IJwYoJGSFbdx7kA4j', // Tim White (1 followers)
  '2NcOGCWu0s4TCuyQ8uznvh', // Tim White (17 followers)
  '7nabL5l0EyTetjLq3Xk0vH', // Tim White (0 followers)
  '3nWCQ83cElZ66c2WHLe2pk', // Tim White (0 followers)
  '4WKankHcHd57xrmnSpLj5Z', // Tim White (0 followers)
  '7EmVdM5Rsdmk0R5GilukcS', // Tim White (1 followers)
  '294NZijyVGN2RLzz9C4NpN', // Tim White (0 followers)
  '41JZpTX17gSjZXfFWK4rU1', // Tim White (1 followers)
  '7lD2HnR5vb4X1aVUCGIvNj', // Tim White (40 followers)
  '1Kt0V6RDgyWhADM2YByhCx', // Tim White (bluegrass, 40 followers)
  '7wZY1FO4sfZ7HRrGOgdMZM', // Tim White (0 followers)
  '7M56iFsKMQ263mvlIICffh', // Tim White (0 followers)

  // "Tim White &" / "Tim White," collaboration profiles
  '7AdaBLkStiD5F763iRZWjU', // Tim White & ReFocused (gospel, 836 followers)
  '3TDEOhBCaqn0IRgeDo6JfV', // Tim White & Joe Paulino (95 followers)
  '1f4C5k6BZv82aln0mf4qog', // Tim White, Sosa & Bo-J (2 followers)

  // "Tim White*" prefix matches
  '1Lb1WBHEzaUxcaSXlPZnHE', // Min. Tim White (41 followers)
  '13IWnPwTAA1aXds4yLNP7K', // Tim Whiteford (43 followers)
  '6VysrkUBdLDZnJm6w1hLs0', // Tim Whitelaw (49 followers)
  '5Gwo9NZpZ3lSwKPFMNXU0t', // Tim Whitehead (18 followers)
  '76KunyVq0EhmfG6Fmt7Wxk', // Tim Whitehead (133 followers)
  '5tVGHjKLJJHGRq5W80J7Td', // Tim Whitelaw (2 followers)
  '1EsFCOa6PIkbQDRWAzkOex', // Tim Whitehead Quartet (48 followers)
]);

// Safety assertion: prevent accidental self-blacklisting
if (SPOTIFY_BLACKLISTED_IDS.has(TIM_WHITE_SPOTIFY_ID)) {
  throw new Error(
    `[Spotify Blacklist] FATAL: The correct Tim White Spotify ID (${TIM_WHITE_SPOTIFY_ID}) was found in the blacklist. This would break all Tim White search results.`
  );
}

/** Check if a Spotify artist ID is blacklisted */
export function isBlacklistedSpotifyId(spotifyId: string): boolean {
  return SPOTIFY_BLACKLISTED_IDS.has(spotifyId);
}

/**
 * Filter blacklisted artists from search results.
 * Logs filtered IDs for observability.
 */
export function filterBlacklistedResults<T extends { id: string }>(
  results: T[]
): T[] {
  const filtered = results.filter(r => !SPOTIFY_BLACKLISTED_IDS.has(r.id));
  const removedCount = results.length - filtered.length;

  if (removedCount > 0) {
    const removedIds = results
      .filter(r => SPOTIFY_BLACKLISTED_IDS.has(r.id))
      .map(r => r.id);
    logger.info('[Spotify Blacklist] Filtered blacklisted artists', {
      removedCount,
      removedIds,
    });
  }

  return filtered;
}
