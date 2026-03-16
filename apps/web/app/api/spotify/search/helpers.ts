/**
 * Spotify Search API Helpers
 *
 * Pure helper functions for the Spotify search endpoint.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getFeaturedCreatorsForSearch } from '@/lib/featured-creators';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';
import type { SpotifyArtistResult } from './route';

/**
 * Apply VIP boost to search results, prioritizing featured creators
 * for exact name matches. Filters out other results with the same
 * normalized name to prevent duplicates.
 */
export async function applyVipBoost(
  results: SpotifyArtistResult[],
  query: string,
  limit: number
): Promise<SpotifyArtistResult[]> {
  try {
    const vipMap = await getFeaturedCreatorsForSearch();
    const normalizedQuery = query.toLowerCase().trim();
    const vipArtist = vipMap.get(normalizedQuery);

    if (!vipArtist) {
      return results;
    }

    return boostVipArtist(results, vipArtist, limit);
  } catch (vipError) {
    // VIP lookup failure should not break search - log and continue
    logger.warn('[Spotify Search] VIP lookup failed:', vipError);
    return results;
  }
}

interface VipArtist {
  spotifyId: string;
  name: string;
  imageUrl: string | null;
  followers: number;
  popularity: number;
}

/**
 * Boost a VIP artist to the top of results and filter out
 * other results with the same normalized name.
 */
function boostVipArtist(
  results: SpotifyArtistResult[],
  vipArtist: VipArtist,
  limit: number
): SpotifyArtistResult[] {
  const normalizedVipName = vipArtist.name.toLowerCase().trim();

  // Filter out non-VIP results with the same name
  const filtered = results.filter(
    r =>
      r.id === vipArtist.spotifyId ||
      r.name.toLowerCase().trim() !== normalizedVipName
  );

  const existingIndex = filtered.findIndex(r => r.id === vipArtist.spotifyId);

  // Already at top
  if (existingIndex === 0) {
    return filtered;
  }

  // Move to top if already in results but not first
  if (existingIndex > 0) {
    const [vipResult] = filtered.splice(existingIndex, 1);
    return [vipResult, ...filtered];
  }

  // Add to top if not in results at all
  const vipResult: SpotifyArtistResult = {
    id: vipArtist.spotifyId,
    name: vipArtist.name,
    url: buildSpotifyArtistUrl(vipArtist.spotifyId),
    imageUrl: vipArtist.imageUrl ?? undefined,
    followers: vipArtist.followers,
    popularity: vipArtist.popularity,
    verified: undefined,
  };

  return [vipResult, ...filtered.slice(0, limit - 1)];
}

/**
 * Query claimed Spotify IDs from the database.
 * Cached for 30 seconds to reduce DB hits under search traffic.
 */
async function queryClaimedSpotifyIds(spotifyIds: string[]): Promise<string[]> {
  const claimed = await db
    .select({ spotifyId: creatorProfiles.spotifyId })
    .from(creatorProfiles)
    .where(
      and(
        inArray(creatorProfiles.spotifyId, spotifyIds),
        eq(creatorProfiles.isClaimed, true)
      )
    );

  return claimed.map(r => r.spotifyId).filter((id): id is string => id != null);
}

const getCachedClaimedSpotifyIds = unstable_cache(
  queryClaimedSpotifyIds,
  ['claimed-spotify-ids'],
  {
    revalidate: 30,
    tags: ['claimed-artists'],
  }
);

/**
 * Annotate search results with claimed status.
 * Results where the Spotify ID belongs to a claimed creator profile
 * will have `isClaimed: true` set.
 */
export async function annotateClaimedStatus(
  results: SpotifyArtistResult[]
): Promise<SpotifyArtistResult[]> {
  if (results.length === 0) return results;

  try {
    const spotifyIds = results.map(r => r.id);
    const claimedIds = new Set(await getCachedClaimedSpotifyIds(spotifyIds));

    if (claimedIds.size === 0) return results;

    return results.map(r =>
      claimedIds.has(r.id) ? { ...r, isClaimed: true } : r
    );
  } catch (error) {
    logger.warn('[Spotify Search] Claimed status lookup failed:', error);
    return results;
  }
}

/**
 * Parse and clamp the limit parameter.
 */
export function parseLimit(
  limitParam: string | null,
  defaultLimit: number,
  maxLimit: number
): number {
  if (!limitParam) {
    return defaultLimit;
  }

  const parsed = Number.parseInt(limitParam, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}
