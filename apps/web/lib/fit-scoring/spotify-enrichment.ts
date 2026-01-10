/**
 * Spotify Enrichment for Fit Scoring
 *
 * Fetches artist data from Spotify and updates the creator profile
 * with enrichment data needed for fit scoring.
 */

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import type { DbType } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';
import { getSpotifyArtist, isSpotifyAvailable } from '@/lib/spotify/index';

import { calculateAndStoreFitScore } from './service';

/**
 * Result of enriching a single profile
 */
export interface EnrichmentResult {
  profileId: string;
  success: boolean;
  enriched: boolean;
  error?: string;
  spotifyData?: {
    genres: string[];
    followers: number;
    popularity: number;
  };
}

/**
 * Enrich a creator profile with Spotify data and recalculate fit score.
 *
 * @param db - Database client
 * @param creatorProfileId - ID of the profile to enrich
 * @returns Enrichment result
 */
export async function enrichProfileWithSpotify(
  db: DbType,
  creatorProfileId: string
): Promise<EnrichmentResult> {
  // Check if Spotify is available
  if (!isSpotifyAvailable()) {
    return {
      profileId: creatorProfileId,
      success: false,
      enriched: false,
      error: 'Spotify API not configured',
    };
  }

  // Fetch the profile
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      spotifyId: creatorProfiles.spotifyId,
      genres: creatorProfiles.genres,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  if (!profile) {
    return {
      profileId: creatorProfileId,
      success: false,
      enriched: false,
      error: 'Profile not found',
    };
  }

  // Skip if no Spotify ID
  if (!profile.spotifyId) {
    return {
      profileId: creatorProfileId,
      success: true,
      enriched: false,
      error: 'No Spotify ID on profile',
    };
  }

  // Fetch artist data from Spotify
  const artist = await getSpotifyArtist(profile.spotifyId);

  if (!artist) {
    return {
      profileId: creatorProfileId,
      success: false,
      enriched: false,
      error: 'Failed to fetch Spotify artist data',
    };
  }

  // Update the profile with Spotify data
  await db
    .update(creatorProfiles)
    .set({
      genres: artist.genres,
      spotifyFollowers: artist.followerCount,
      spotifyPopularity: artist.popularity,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, creatorProfileId));

  // Recalculate fit score with new data
  await calculateAndStoreFitScore(db, creatorProfileId);

  return {
    profileId: creatorProfileId,
    success: true,
    enriched: true,
    spotifyData: {
      genres: artist.genres,
      followers: artist.followerCount,
      popularity: artist.popularity,
    },
  };
}

/**
 * Enrich profiles that have Spotify IDs but are missing enrichment data.
 *
 * @param db - Database client
 * @param limit - Maximum number of profiles to process
 * @returns Array of enrichment results
 */
export async function enrichMissingSpotifyData(
  db: DbType,
  limit = 50
): Promise<EnrichmentResult[]> {
  if (!isSpotifyAvailable()) {
    return [];
  }

  // Find profiles with Spotify ID but missing enrichment data
  const profiles = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        isNotNull(creatorProfiles.spotifyId),
        isNull(creatorProfiles.spotifyPopularity)
      )
    )
    .limit(limit);

  const results: EnrichmentResult[] = [];

  for (const profile of profiles) {
    const result = await enrichProfileWithSpotify(db, profile.id);
    results.push(result);

    // Small delay to avoid rate limiting
    if (results.length < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Get profiles that need Spotify enrichment.
 *
 * @param db - Database client
 * @param limit - Maximum number to return
 * @returns Count and sample of profiles needing enrichment
 */
export async function getEnrichmentQueue(
  db: DbType,
  limit = 10
): Promise<{
  total: number;
  sample: Array<{ id: string; username: string; spotifyId: string }>;
}> {
  // Count total
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorProfiles)
    .where(
      and(
        isNotNull(creatorProfiles.spotifyId),
        isNull(creatorProfiles.spotifyPopularity)
      )
    );

  // Get sample
  const sample = await db
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      spotifyId: creatorProfiles.spotifyId,
    })
    .from(creatorProfiles)
    .where(
      and(
        isNotNull(creatorProfiles.spotifyId),
        isNull(creatorProfiles.spotifyPopularity)
      )
    )
    .limit(limit);

  return {
    total: countResult?.count ?? 0,
    sample: sample.filter(
      (p): p is { id: string; username: string; spotifyId: string } =>
        p.spotifyId !== null
    ),
  };
}
