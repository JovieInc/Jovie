import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogTracks,
} from '@/lib/db/schema/content';

export interface LyricsRouteTrack {
  readonly title: string;
  readonly artist: string;
  readonly lyrics: string | null;
}

function normalizeLyrics(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function lyricsFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const value = metadata?.lyrics;
  return typeof value === 'string' ? normalizeLyrics(value) : null;
}

export async function loadLyricsRouteTrack(params: {
  readonly profileId: string;
  readonly trackId: string;
  readonly fallbackArtist: string;
}): Promise<LyricsRouteTrack | null> {
  const [recording] = await db
    .select({
      title: discogRecordings.title,
      lyrics: discogRecordings.lyrics,
    })
    .from(discogRecordings)
    .where(
      and(
        eq(discogRecordings.id, params.trackId),
        eq(discogRecordings.creatorProfileId, params.profileId)
      )
    )
    .limit(1);

  if (recording) {
    return {
      title: recording.title,
      artist: params.fallbackArtist,
      lyrics: normalizeLyrics(recording.lyrics),
    };
  }

  const [legacyTrack] = await db
    .select({
      title: discogTracks.title,
      lyrics: discogTracks.lyrics,
    })
    .from(discogTracks)
    .where(
      and(
        eq(discogTracks.id, params.trackId),
        eq(discogTracks.creatorProfileId, params.profileId)
      )
    )
    .limit(1);

  if (legacyTrack) {
    return {
      title: legacyTrack.title,
      artist: params.fallbackArtist,
      lyrics: normalizeLyrics(legacyTrack.lyrics),
    };
  }

  const [release] = await db
    .select({
      title: discogReleases.title,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, params.trackId),
        eq(discogReleases.creatorProfileId, params.profileId)
      )
    )
    .limit(1);

  if (!release) return null;

  return {
    title: release.title,
    artist: params.fallbackArtist,
    lyrics: lyricsFromMetadata(release.metadata),
  };
}
