/**
 * Spotify Search API Helpers
 *
 * Pure helper functions for the Spotify search endpoint.
 */

import { getFeaturedCreatorsForSearch } from '@/lib/featured-creators';
import { buildSpotifyArtistUrl } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';
import type { SpotifyArtistResult } from './route';

/**
 * Apply VIP boost to search results, prioritizing featured creators
 * for exact name matches.
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
 * Boost a VIP artist to the top of results.
 */
function boostVipArtist(
  results: SpotifyArtistResult[],
  vipArtist: VipArtist,
  limit: number
): SpotifyArtistResult[] {
  const existingIndex = results.findIndex(r => r.id === vipArtist.spotifyId);

  // Already at top
  if (existingIndex === 0) {
    return results;
  }

  // Move to top if already in results but not first
  if (existingIndex > 0) {
    const [vipResult] = results.splice(existingIndex, 1);
    return [vipResult, ...results];
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

  return [vipResult, ...results.slice(0, limit - 1)];
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
