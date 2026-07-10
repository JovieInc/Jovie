'use server';

/**
 * Own-graph artist sources for the entity picker (JOV-3717).
 *
 * Returns the claimed-self Spotify identity (when linked) plus catalog
 * collaborators that have a Spotify id — enough to tag without a Spotify
 * search round-trip on cold start.
 */

import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { getDashboardDataEssential } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { db } from '@/lib/db';
import {
  artists,
  discogReleases,
  releaseArtists,
} from '@/lib/db/schema/content';

export interface OwnGraphArtist {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string | null;
  /** True when this is the current profile's linked Spotify artist. */
  readonly isClaimedSelf: boolean;
}

export async function loadOwnGraphArtists(
  profileId: string
): Promise<readonly OwnGraphArtist[]> {
  if (!profileId) return [];

  const data = await getDashboardDataEssential();
  const profile =
    data.selectedProfile?.id === profileId
      ? data.selectedProfile
      : (data.creatorProfiles.find(p => p.id === profileId) ?? null);

  if (!profile) return [];

  const out: OwnGraphArtist[] = [];
  const seen = new Set<string>();
  const selfSpotifyId = profile.spotifyId?.trim() || null;

  if (selfSpotifyId) {
    seen.add(selfSpotifyId);
    out.push({
      id: selfSpotifyId,
      name: profile.displayName?.trim() || profile.username || 'You',
      imageUrl: profile.avatarUrl ?? null,
      isClaimedSelf: true,
    });
  }

  const collaboratorWhere = [
    eq(discogReleases.creatorProfileId, profileId),
    isNull(discogReleases.deletedAt),
    isNotNull(artists.spotifyId),
  ];
  if (selfSpotifyId) {
    collaboratorWhere.push(ne(artists.spotifyId, selfSpotifyId));
  }

  const collaboratorRows = await db
    .select({
      id: artists.spotifyId,
      name: artists.name,
      imageUrl: artists.imageUrl,
    })
    .from(releaseArtists)
    .innerJoin(artists, eq(releaseArtists.artistId, artists.id))
    .innerJoin(discogReleases, eq(releaseArtists.releaseId, discogReleases.id))
    .where(and(...collaboratorWhere))
    .limit(48);

  for (const row of collaboratorRows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      name: row.name,
      imageUrl: row.imageUrl,
      isClaimedSelf: false,
    });
    if (out.length >= 20) break;
  }

  return out;
}
