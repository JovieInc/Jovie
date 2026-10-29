import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
} from '@/lib/db/schema/content';

/**
 * The LIVE catalog read for anything agent-facing (chat, merch, pitch...).
 *
 * Deleting or archiving a release must make it invisible to every agent at
 * answer time, so agent reads never trust memory, summaries or snapshots, and
 * never read `discog_recordings` directly: recordings are profile-scoped and
 * outlive their release. A recording is live only if some non-archived release
 * still carries it.
 */
export async function getLiveRecordingTitles(
  profileId: string,
  limit: number
): Promise<string[]> {
  const rows = await db
    .selectDistinct({
      title: discogRecordings.title,
      updatedAt: discogRecordings.updatedAt,
    })
    .from(discogRecordings)
    .innerJoin(
      discogReleaseTracks,
      eq(discogReleaseTracks.recordingId, discogRecordings.id)
    )
    .innerJoin(
      discogReleases,
      and(
        eq(discogReleases.id, discogReleaseTracks.releaseId),
        isNull(discogReleases.deletedAt)
      )
    )
    .where(eq(discogRecordings.creatorProfileId, profileId))
    .limit(limit);
  return rows.map(row => row.title);
}
