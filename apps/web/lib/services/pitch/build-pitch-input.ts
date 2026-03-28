/**
 * Shared pitch input builder.
 *
 * Assembles the PitchInput required by generatePitches() from the database.
 * Used by both the pitch API route and the chat tool to avoid duplication.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  artists,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  recordingArtists,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type { PitchInput } from './types';

/**
 * Builds a PitchInput by loading release, artist profile, and track data.
 * Enforces ownership: only returns data if the release belongs to the given profile.
 *
 * @throws Error if release not found or doesn't belong to profile.
 */
export async function buildPitchInput(
  profileId: string,
  releaseId: string
): Promise<PitchInput> {
  // Load release and verify ownership
  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
      releaseType: discogReleases.releaseType,
      genres: discogReleases.genres,
      totalTracks: discogReleases.totalTracks,
      label: discogReleases.label,
      distributor: discogReleases.distributor,
      targetPlaylists: discogReleases.targetPlaylists,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, profileId)
      )
    );

  if (!release) {
    throw new Error('Release not found');
  }

  // Load artist profile data
  const [artistProfile] = await db
    .select({
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      genres: creatorProfiles.genres,
      location: creatorProfiles.location,
      activeSinceYear: creatorProfiles.activeSinceYear,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      pitchContext: creatorProfiles.pitchContext,
      targetPlaylists: creatorProfiles.targetPlaylists,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId));

  // Load tracks with artist credits via recordings
  const trackRows = await db
    .select({
      title: discogReleaseTracks.title,
      durationMs: discogRecordings.durationMs,
      creditName: recordingArtists.creditName,
      artistName: artists.name,
    })
    .from(discogReleaseTracks)
    .innerJoin(
      discogRecordings,
      eq(discogReleaseTracks.recordingId, discogRecordings.id)
    )
    .leftJoin(
      recordingArtists,
      eq(recordingArtists.recordingId, discogRecordings.id)
    )
    .leftJoin(artists, eq(artists.id, recordingArtists.artistId))
    .where(eq(discogReleaseTracks.releaseId, releaseId));

  // Group credits by track
  const trackMap = new Map<
    string,
    { title: string; durationMs: number | null; creditNames: string[] }
  >();
  for (const row of trackRows) {
    const existing = trackMap.get(row.title);
    const creditName = row.creditName ?? row.artistName;
    if (existing) {
      if (creditName && !existing.creditNames.includes(creditName)) {
        existing.creditNames.push(creditName);
      }
    } else {
      trackMap.set(row.title, {
        title: row.title,
        durationMs: row.durationMs,
        creditNames: creditName ? [creditName] : [],
      });
    }
  }

  return {
    artist: {
      displayName: artistProfile?.displayName ?? null,
      bio: artistProfile?.bio ?? null,
      genres: artistProfile?.genres ?? null,
      location: artistProfile?.location ?? null,
      activeSinceYear: artistProfile?.activeSinceYear ?? null,
      spotifyFollowers: artistProfile?.spotifyFollowers ?? null,
      spotifyPopularity: artistProfile?.spotifyPopularity ?? null,
      pitchContext: artistProfile?.pitchContext ?? null,
      targetPlaylists: release.targetPlaylists?.length
        ? release.targetPlaylists
        : (artistProfile?.targetPlaylists ?? null),
    },
    release: {
      title: release.title,
      releaseDate: release.releaseDate,
      releaseType: release.releaseType,
      genres: release.genres,
      totalTracks: release.totalTracks,
      label: release.label,
      distributor: release.distributor,
    },
    tracks: Array.from(trackMap.values()),
  };
}
