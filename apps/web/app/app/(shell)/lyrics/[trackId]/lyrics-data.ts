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
  readonly durationMs: number | null;
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

/**
 * Resolve the lyrics surface track for a given track id, scoped to a profile.
 *
 * Precedence (first non-null wins):
 *   1. discogRecordings.lyrics — canonical recording (new model)
 *   2. discogTracks.lyrics     — legacy per-release track (kept for migration)
 *   3. discogReleases.metadata.lyrics — release-level lyrics (when the trackId
 *      points at a release id, e.g. release-preview playback)
 *
 * Wrong-profile and unknown ids return null so the route can `notFound()`.
 * Empty/whitespace-only lyric strings are normalized to null so the empty
 * state renders deterministically.
 */
export async function loadLyricsRouteTrack(params: {
  readonly profileId: string;
  readonly trackId: string;
  readonly fallbackArtist: string;
}): Promise<LyricsRouteTrack | null> {
  const [recording] = await db
    .select({
      title: discogRecordings.title,
      lyrics: discogRecordings.lyrics,
      durationMs: discogRecordings.durationMs,
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
      durationMs: recording.durationMs ?? null,
    };
  }

  const [legacyTrack] = await db
    .select({
      title: discogTracks.title,
      lyrics: discogTracks.lyrics,
      durationMs: discogTracks.durationMs,
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
      durationMs: legacyTrack.durationMs ?? null,
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
    durationMs: null,
  };
}
