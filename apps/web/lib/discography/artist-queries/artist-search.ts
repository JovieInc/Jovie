/**
 * Artist Search & Discovery
 *
 * Search and analytics queries for artists.
 */

import {
  and,
  count,
  eq,
  ilike,
  inArray,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type Artist,
  artists,
  releaseArtists,
  trackArtists,
} from '@/lib/db/schema';
import type { CollaboratorInfo } from './types';

/**
 * Search artists by name
 */
export async function searchArtists(
  query: string,
  options?: {
    limit?: number;
    excludeIds?: string[];
  }
): Promise<Artist[]> {
  const { limit = 20, excludeIds = [] } = options ?? {};

  const searchPattern = `%${query}%`;
  const nameMatch = or(
    ilike(artists.name, searchPattern),
    ilike(artists.nameNormalized, searchPattern)
  );

  const whereClause =
    excludeIds.length > 0
      ? and(nameMatch, notInArray(artists.id, excludeIds))
      : nameMatch;

  return db
    .select()
    .from(artists)
    .where(whereClause)
    .orderBy(artists.name)
    .limit(limit);
}

/**
 * Get frequent collaborators for an artist
 *
 * Finds artists who have appeared on the same tracks
 */
export async function getFrequentCollaborators(
  artistId: string,
  options?: { limit?: number }
): Promise<CollaboratorInfo[]> {
  const { limit = 10 } = options ?? {};

  // Get all track IDs this artist appears on
  const artistTracks = await db
    .select({ trackId: trackArtists.trackId })
    .from(trackArtists)
    .where(eq(trackArtists.artistId, artistId));

  // Get all release IDs this artist appears on
  const artistReleases = await db
    .select({ releaseId: releaseArtists.releaseId })
    .from(releaseArtists)
    .where(eq(releaseArtists.artistId, artistId));

  if (artistTracks.length === 0 && artistReleases.length === 0) {
    return [];
  }

  const trackIds = artistTracks.map(t => t.trackId);
  const releaseIds = artistReleases.map(r => r.releaseId);

  // Find other artists on these tracks (with track count)
  const trackCollaborators =
    trackIds.length > 0
      ? await db
          .select({
            artistId: trackArtists.artistId,
            trackCount: count(trackArtists.trackId),
          })
          .from(trackArtists)
          .where(
            and(
              inArray(trackArtists.trackId, trackIds),
              sql`${trackArtists.artistId} != ${artistId}`
            )
          )
          .groupBy(trackArtists.artistId)
      : [];

  // Find other artists on these releases (with release count)
  const releaseCollaborators =
    releaseIds.length > 0
      ? await db
          .select({
            artistId: releaseArtists.artistId,
            releaseCount: count(releaseArtists.releaseId),
          })
          .from(releaseArtists)
          .where(
            and(
              inArray(releaseArtists.releaseId, releaseIds),
              sql`${releaseArtists.artistId} != ${artistId}`
            )
          )
          .groupBy(releaseArtists.artistId)
      : [];

  // Merge track and release collaborator data
  const releaseCountMap = new Map(
    releaseCollaborators.map(c => [c.artistId, Number(c.releaseCount)])
  );

  // Sort by track count and limit
  const collaborators = trackCollaborators
    .map(c => ({
      artistId: c.artistId,
      trackCount: c.trackCount,
      releaseCount: releaseCountMap.get(c.artistId) ?? 0,
    }))
    .sort((a, b) => Number(b.trackCount) - Number(a.trackCount))
    .slice(0, limit);

  // Fetch artist details
  const collaboratorIds = collaborators.map(c => c.artistId);
  if (collaboratorIds.length === 0) {
    return [];
  }

  const artistDetails = await db
    .select()
    .from(artists)
    .where(inArray(artists.id, collaboratorIds));

  const artistMap = new Map(artistDetails.map(a => [a.id, a]));

  return collaborators
    .map(c => {
      const artist = artistMap.get(c.artistId);
      if (!artist) return null;

      return {
        artist,
        trackCount: Number(c.trackCount),
        releaseCount: c.releaseCount,
      };
    })
    .filter((c): c is CollaboratorInfo => c !== null);
}
