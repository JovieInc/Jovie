import { sql as drizzleSql } from 'drizzle-orm';
import type { DbType } from '@/lib/db';
import {
  NewSpotifyDiscographyRelease,
  NewSpotifyDiscographyTrack,
  spotifyDiscographyReleases,
  spotifyDiscographyTracks,
} from '@/lib/db/schema';
import type {
  SpotifyReleasePayload,
  SpotifyTrackPayload,
} from '@/lib/spotify/discography';
import { logger } from '@/lib/utils/logger';

export function buildReleaseRows(params: {
  creatorProfileId: string;
  releases: SpotifyReleasePayload[];
  now: Date;
}): NewSpotifyDiscographyRelease[] {
  const { creatorProfileId, releases, now } = params;

  return releases.map(release => ({
    creatorProfileId,
    spotifyId: release.spotifyId,
    spotifyUrl: release.spotifyUrl,
    name: release.name,
    albumType: release.albumType,
    releaseDate: release.releaseDate,
    releaseDatePrecision: release.releaseDatePrecision,
    totalTracks: release.totalTracks ?? release.tracks.length,
    upc: release.upc,
    imageUrl: release.imageUrl,
    artists: release.artists ?? [],
    lastSeenAt: now,
    updatedAt: now,
    createdAt: now,
  }));
}

export function buildTrackRows(params: {
  creatorProfileId: string;
  releases: SpotifyReleasePayload[];
  releaseIdBySpotifyId: Map<string, string>;
  now: Date;
}): NewSpotifyDiscographyTrack[] {
  const { creatorProfileId, releases, releaseIdBySpotifyId, now } = params;

  const rows: NewSpotifyDiscographyTrack[] = [];

  for (const release of releases) {
    const releaseId = releaseIdBySpotifyId.get(release.spotifyId);
    if (!releaseId) continue;

    for (const track of release.tracks) {
      rows.push(transformTrack(track, { creatorProfileId, releaseId, now }));
    }
  }

  return rows;
}

function transformTrack(
  track: SpotifyTrackPayload,
  context: { creatorProfileId: string; releaseId: string; now: Date }
): NewSpotifyDiscographyTrack {
  return {
    releaseId: context.releaseId,
    creatorProfileId: context.creatorProfileId,
    spotifyId: track.spotifyId,
    spotifyUrl: track.spotifyUrl,
    name: track.name,
    durationMs: track.durationMs ?? null,
    trackNumber: track.trackNumber ?? null,
    discNumber: track.discNumber ?? null,
    explicit: Boolean(track.explicit),
    isrc: track.isrc,
    previewUrl: track.previewUrl,
    artists: track.artists ?? [],
    lastSeenAt: context.now,
    updatedAt: context.now,
    createdAt: context.now,
  };
}

export async function upsertSpotifyDiscography(params: {
  tx: DbType;
  creatorProfileId: string;
  releases: SpotifyReleasePayload[];
  now?: Date;
}): Promise<{ releases: number; tracks: number }> {
  const { tx, creatorProfileId } = params;
  const now = params.now ?? new Date();

  if (params.releases.length === 0) {
    return { releases: 0, tracks: 0 };
  }

  const releaseRows = buildReleaseRows({
    creatorProfileId,
    releases: params.releases,
    now,
  });

  const persistedReleases = await tx
    .insert(spotifyDiscographyReleases)
    .values(releaseRows)
    .onConflictDoUpdate({
      target: [
        spotifyDiscographyReleases.creatorProfileId,
        spotifyDiscographyReleases.spotifyId,
      ],
      set: {
        name: drizzleSql`excluded.name`,
        albumType: drizzleSql`excluded.album_type`,
        releaseDate: drizzleSql`excluded.release_date`,
        releaseDatePrecision: drizzleSql`excluded.release_date_precision`,
        totalTracks: drizzleSql`excluded.total_tracks`,
        upc: drizzleSql`excluded.upc`,
        imageUrl: drizzleSql`excluded.image_url`,
        artists: drizzleSql`excluded.artists`,
        spotifyUrl: drizzleSql`excluded.spotify_url`,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning({
      id: spotifyDiscographyReleases.id,
      spotifyId: spotifyDiscographyReleases.spotifyId,
    });

  const releaseIdBySpotifyId = new Map(
    persistedReleases.map(row => [row.spotifyId, row.id])
  );

  const trackRows = buildTrackRows({
    creatorProfileId,
    releases: params.releases,
    releaseIdBySpotifyId,
    now,
  });

  if (trackRows.length === 0) {
    return { releases: persistedReleases.length, tracks: 0 };
  }

  const persistedTracks = await tx
    .insert(spotifyDiscographyTracks)
    .values(trackRows)
    .onConflictDoUpdate({
      target: [
        spotifyDiscographyTracks.creatorProfileId,
        spotifyDiscographyTracks.spotifyId,
      ],
      set: {
        name: drizzleSql`excluded.name`,
        durationMs: drizzleSql`excluded.duration_ms`,
        trackNumber: drizzleSql`excluded.track_number`,
        discNumber: drizzleSql`excluded.disc_number`,
        explicit: drizzleSql`excluded.explicit`,
        isrc: drizzleSql`excluded.isrc`,
        previewUrl: drizzleSql`excluded.preview_url`,
        artists: drizzleSql`excluded.artists`,
        spotifyUrl: drizzleSql`excluded.spotify_url`,
        releaseId: drizzleSql`excluded.release_id`,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning({ id: spotifyDiscographyTracks.id });

  logger.info('Upserted Spotify discography records', {
    creatorProfileId,
    releases: persistedReleases.length,
    tracks: persistedTracks.length,
  });

  return {
    releases: persistedReleases.length,
    tracks: persistedTracks.length,
  };
}
