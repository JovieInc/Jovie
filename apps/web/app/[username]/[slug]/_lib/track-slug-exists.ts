import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db, withRetry } from '@/lib/db';
import { QUERY_TIMEOUTS } from '@/lib/db/query-timeout';
import { discogReleaseTracks, discogTracks } from '@/lib/db/schema/content';

/**
 * Whether a track row with this exact slug exists in the release, in either
 * the release-track model or legacy discog_tracks. Unlike
 * getTrackBySlugInRelease, a track with no provider links still counts.
 */
export async function trackSlugExistsInRelease(
  releaseId: string,
  slug: string
): Promise<boolean> {
  return withRetry(
    async () => {
      const [releaseTrack] = await db
        .select({ id: discogReleaseTracks.id })
        .from(discogReleaseTracks)
        .where(
          and(
            eq(discogReleaseTracks.releaseId, releaseId),
            eq(discogReleaseTracks.slug, slug)
          )
        )
        .limit(1);
      if (releaseTrack) return true;
      const [legacyTrack] = await db
        .select({ id: discogTracks.id })
        .from(discogTracks)
        .where(
          and(
            eq(discogTracks.releaseId, releaseId),
            eq(discogTracks.slug, slug)
          )
        )
        .limit(1);
      return Boolean(legacyTrack);
    },
    `trackSlugExistsInRelease(${releaseId}:${slug})`,
    { operation: 'read', retryBudgetMs: QUERY_TIMEOUTS.api }
  );
}
