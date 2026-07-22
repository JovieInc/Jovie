/**
 * Artist Search & Discovery
 *
 * Search and analytics queries for artists.
 */

import {
  and,
  count,
  sql as drizzleSql,
  eq,
  ilike,
  inArray,
  notInArray,
  or,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type Artist,
  artists,
  discogReleases,
  discogTracks,
  releaseArtists,
  trackArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { CollaboratorInfo, CreditedArtistWithProfile } from './types';

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
 * Resolve artists credited on a creator's catalog (release- and track-level
 * credits) to their public Jovie handles.
 *
 * Only artists whose registry row links to a public creator profile are
 * returned — external collaborators without a Jovie account are excluded so
 * bio mentions of them stay plain text. The display name prefers the credit
 * name (stage name) since that is what bios and release credits show.
 */
export async function getCreditedArtistsWithProfiles(
  creatorProfileId: string,
  options?: { limit?: number }
): Promise<CreditedArtistWithProfile[]> {
  const limit = options?.limit ?? 50;

  const [releaseCredits, trackCredits] = await Promise.all([
    db
      .selectDistinct({
        name: drizzleSql<string>`coalesce(${releaseArtists.creditName}, ${artists.name})`,
        handle: creatorProfiles.usernameNormalized,
      })
      .from(releaseArtists)
      .innerJoin(
        discogReleases,
        eq(releaseArtists.releaseId, discogReleases.id)
      )
      .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
      .innerJoin(
        creatorProfiles,
        eq(artists.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          eq(creatorProfiles.isPublic, true)
        )
      )
      .limit(limit),
    db
      .selectDistinct({
        name: drizzleSql<string>`coalesce(${trackArtists.creditName}, ${artists.name})`,
        handle: creatorProfiles.usernameNormalized,
      })
      .from(trackArtists)
      .innerJoin(discogTracks, eq(trackArtists.trackId, discogTracks.id))
      .innerJoin(artists, eq(trackArtists.artistId, artists.id))
      .innerJoin(
        creatorProfiles,
        eq(artists.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(discogTracks.creatorProfileId, creatorProfileId),
          eq(creatorProfiles.isPublic, true)
        )
      )
      .limit(limit),
  ]);

  const seen = new Set<string>();
  const merged: CreditedArtistWithProfile[] = [];
  for (const row of [...releaseCredits, ...trackCredits]) {
    const name = row.name?.trim();
    const handle = row.handle?.trim();
    if (!name || !handle) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ name, handle });
    if (merged.length >= limit) break;
  }
  return merged;
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
              drizzleSql`${trackArtists.artistId} != ${artistId}`
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
              drizzleSql`${releaseArtists.artistId} != ${artistId}`
            )
          )
          .groupBy(releaseArtists.artistId)
      : [];

  // Build count maps for both track and release collaborators
  const trackCountMap = new Map(
    trackCollaborators.map(c => [c.artistId, Number(c.trackCount)])
  );
  const releaseCountMap = new Map(
    releaseCollaborators.map(c => [c.artistId, Number(c.releaseCount)])
  );

  // Combine all unique artist IDs from both track and release collaborators
  const allCollaboratorIds = new Set([
    ...trackCollaborators.map(c => c.artistId),
    ...releaseCollaborators.map(c => c.artistId),
  ]);

  // Create collaborator objects with counts from both sources
  const collaborators = Array.from(allCollaboratorIds)
    .map(artistId => ({
      artistId,
      trackCount: trackCountMap.get(artistId) ?? 0,
      releaseCount: releaseCountMap.get(artistId) ?? 0,
    }))
    .sort(
      (a, b) => b.trackCount - a.trackCount || b.releaseCount - a.releaseCount
    )
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
