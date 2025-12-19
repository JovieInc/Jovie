import type { DbType } from '@/lib/db';
import { upsertSpotifyDiscography } from '@/lib/db/discography';
import { fetchSpotifyDiscography } from '@/lib/spotify/discography';
import { logger } from '@/lib/utils/logger';

export async function syncSpotifyDiscography(params: {
  tx: DbType;
  creatorProfileId: string;
  spotifyId: string;
  now?: Date;
}) {
  const releases = await fetchSpotifyDiscography(params.spotifyId);

  logger.info('Fetched Spotify discography', {
    spotifyId: params.spotifyId,
    releases: releases.length,
  });

  const upserted = await upsertSpotifyDiscography({
    tx: params.tx,
    creatorProfileId: params.creatorProfileId,
    releases,
    now: params.now,
  });

  return {
    releasesFetched: releases.length,
    releasesUpserted: upserted.releases,
    tracksUpserted: upserted.tracks,
  };
}
