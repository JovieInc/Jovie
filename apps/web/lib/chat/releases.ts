import 'server-only';

import { and, desc, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { getCanvasStatusFromMetadata } from '@/lib/services/canvas/service';
import { toISOStringOrNull } from '@/lib/utils/date';
import type { ReleaseCatalogSnapshot, ReleaseContext } from './types';

/** Rows loaded per chat turn for the prompt slice and tool closures. */
export const CHAT_RELEASE_LIMIT = 50;

/**
 * Fetches the artist's release catalog for chat context (creative tools,
 * canvas, pitches, etc.). Call once per chat turn and pass the snapshot into
 * the turn pipeline and tool factories.
 *
 * Semantics (dogfood 2026-11-10, Mac app):
 * - Known dates first, undated releases last (`DESC NULLS LAST`), with a
 *   deterministic id tiebreaker so duplicate/undated rows cannot interleave
 *   across reads. Mirrors the canonical library ordering (JOV-6272).
 * - `total` is the whole-catalog count (window count), so the prompt can say
 *   "120 total, 25 shown" instead of reporting the loaded slice as the total.
 * - `status: 'unavailable'` when the read fails; the artist may still have
 *   releases, so this must never be rendered as "no releases exist".
 * - Soft-deleted (archived) releases are excluded.
 */
export async function fetchReleaseCatalogForChat(
  profileId: string
): Promise<ReleaseCatalogSnapshot> {
  try {
    const rows = await db
      .select({
        id: discogReleases.id,
        title: discogReleases.title,
        releaseType: discogReleases.releaseType,
        releaseDate: discogReleases.releaseDate,
        artworkUrl: discogReleases.artworkUrl,
        spotifyPopularity: discogReleases.spotifyPopularity,
        totalTracks: discogReleases.totalTracks,
        metadata: discogReleases.metadata,
        // Window count (evaluated before LIMIT): the full catalog size, not
        // just the rows this query returns.
        total: drizzleSql<number>`count(*) over ()`.mapWith(Number),
      })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, profileId),
          isNull(discogReleases.deletedAt)
        )
      )
      .orderBy(
        drizzleSql`${discogReleases.releaseDate} DESC NULLS LAST`,
        desc(discogReleases.id)
      )
      .limit(CHAT_RELEASE_LIMIT);

    const releases: ReleaseContext[] = rows.map(release => ({
      ...release,
      releaseDate: toISOStringOrNull(release.releaseDate),
      canvasStatus: getCanvasStatusFromMetadata(release.metadata),
    }));

    return {
      status: 'ok',
      total: rows.length > 0 ? (rows[0].total ?? 0) : 0,
      releases,
    };
  } catch (error) {
    console.warn('[chat] release catalog read failed', error);
    return { status: 'unavailable', total: null, releases: [] };
  }
}

/**
 * Legacy slice-only fetch kept for the mobile turn handler. Preserves the
 * base rejection contract: a failed read THROWS (it never resolves to an
 * empty list that would read as "no releases"). Prefer
 * `fetchReleaseCatalogForChat`, which reports read health instead.
 */
export async function fetchReleasesForChat(
  profileId: string
): Promise<ReleaseContext[]> {
  const snapshot = await fetchReleaseCatalogForChat(profileId);
  if (snapshot.status === 'unavailable') {
    throw new Error('Release catalog read failed');
  }
  return snapshot.releases;
}
