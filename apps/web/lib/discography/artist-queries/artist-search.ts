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
  isNull,
  ne,
  notInArray,
  or,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type Artist,
  type ArtistRole,
  artists,
  discogReleases,
  discogTracks,
  releaseArtists,
  trackArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicReleaseEligibilitySqlPredicate } from '@/lib/profile/public-release-eligibility';
import {
  isPublicArtistCollaboratorRole,
  PUBLIC_ARTIST_COLLABORATOR_ROLES,
} from '../artist-credit-policy';
import { artistProfileHref } from '../artist-profile-routing';
import type {
  CollaboratorInfo,
  CreditedArtistWithProfile,
  StructuredReleaseCollaborator,
} from './types';

export interface StructuredReleaseCollaboratorRow {
  readonly artistId: string;
  readonly artistName: string;
  readonly artistSpotifyId: string | null;
  readonly artistProfileId: string | null;
  readonly profileIsPublic: boolean | null;
  readonly profileIsClaimed: boolean | null;
  readonly creditName: string | null;
  readonly role: ArtistRole;
  readonly position: number;
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly releaseSlug: string;
  readonly releaseDate: Date | null;
}

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
 * legacy bio mentions stay plain text. The display name prefers the credit
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
 * Structured performing-artist credits for public profile prose.
 *
 * Identity and dedupe are registry-ID based. Display names are never used to
 * decide who owns a profile, and every result retains its exact release edge.
 */
export async function getStructuredReleaseCollaborators(
  creatorProfileId: string,
  options: { ownerSpotifyId: string; limit?: number }
): Promise<StructuredReleaseCollaborator[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 24, 100));
  const rows = await db
    .select({
      artistId: artists.id,
      artistName: artists.name,
      artistSpotifyId: artists.spotifyId,
      artistProfileId: artists.creatorProfileId,
      profileIsPublic: creatorProfiles.isPublic,
      profileIsClaimed: creatorProfiles.isClaimed,
      creditName: releaseArtists.creditName,
      role: releaseArtists.role,
      position: releaseArtists.position,
      releaseId: discogReleases.id,
      releaseTitle: discogReleases.title,
      releaseSlug: discogReleases.slug,
      releaseDate: discogReleases.releaseDate,
    })
    .from(releaseArtists)
    .innerJoin(discogReleases, eq(releaseArtists.releaseId, discogReleases.id))
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .leftJoin(creatorProfiles, eq(artists.creatorProfileId, creatorProfiles.id))
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        inArray(releaseArtists.role, PUBLIC_ARTIST_COLLABORATOR_ROLES),
        or(
          isNull(artists.creatorProfileId),
          ne(artists.creatorProfileId, creatorProfileId)
        ),
        or(
          isNull(artists.spotifyId),
          ne(artists.spotifyId, options.ownerSpotifyId)
        ),
        publicReleaseEligibilitySqlPredicate()
      )
    )
    .orderBy(
      drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`,
      discogReleases.id,
      releaseArtists.position,
      artists.id
    )
    .limit(limit * 4);

  return projectStructuredReleaseCollaborators({
    creatorProfileId,
    ownerSpotifyId: options.ownerSpotifyId,
    rows,
    limit,
  });
}

function projectStructuredReleaseCollaborator(
  row: StructuredReleaseCollaboratorRow,
  creatorProfileId: string,
  ownerSpotifyId: string | null
): StructuredReleaseCollaborator | null {
  if (!isPublicArtistCollaboratorRole(row.role)) return null;

  // Exact profile/Spotify identity excludes the profile owner. Names are not
  // consulted because aliases and same-name artists are both legitimate.
  if (
    row.artistProfileId === creatorProfileId ||
    (ownerSpotifyId && row.artistSpotifyId === ownerSpotifyId)
  ) {
    return null;
  }

  const name = (row.creditName ?? row.artistName).trim();
  if (!name) return null;

  const hasPublicProfile =
    Boolean(row.artistProfileId) && row.profileIsPublic === true;
  const hasPrivateProfileBinding =
    Boolean(row.artistProfileId) && row.profileIsPublic !== true;
  let profileState: StructuredReleaseCollaborator['profileState'] =
    'unavailable';
  if (hasPublicProfile) {
    profileState = row.profileIsClaimed ? 'claimed' : 'unclaimed';
  }

  return {
    artistId: row.artistId,
    name,
    // A structured Spotify identity has a canonical entity route even before
    // its claim-safe profile row is materialized. The route self-heals the
    // eligible unclaimed profile on first visit; names without an exact
    // provider identity remain plain text rather than reserving a handle by
    // display name alone.
    href:
      hasPublicProfile || (!hasPrivateProfileBinding && row.artistSpotifyId)
        ? artistProfileHref(row.artistId)
        : null,
    profileState,
    reconciliationEligible: Boolean(row.artistSpotifyId),
    role: row.role,
    releaseId: row.releaseId,
    releaseTitle: row.releaseTitle,
    releaseSlug: row.releaseSlug,
    releaseDate: row.releaseDate,
    position: row.position,
  };
}

export function projectStructuredReleaseCollaborators(params: {
  readonly creatorProfileId: string;
  readonly ownerSpotifyId: string | null;
  readonly rows: readonly StructuredReleaseCollaboratorRow[];
  readonly limit: number;
}): StructuredReleaseCollaborator[] {
  const { creatorProfileId, ownerSpotifyId, rows, limit } = params;
  const seenEdges = new Set<string>();
  const collaborators: StructuredReleaseCollaborator[] = [];

  for (const row of rows) {
    const collaborator = projectStructuredReleaseCollaborator(
      row,
      creatorProfileId,
      ownerSpotifyId
    );
    if (!collaborator) continue;

    const edgeKey = `${row.releaseId}:${row.artistId}:${row.role}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    collaborators.push(collaborator);

    if (collaborators.length >= limit) break;
  }

  return collaborators;
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
