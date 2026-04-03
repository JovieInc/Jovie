import 'server-only';

import { and, count, eq, gt, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { albumArtGenerationSessions } from '@/lib/db/schema/album-art';

export async function getRemainingAlbumArtRuns(params: {
  readonly profileId: string;
  readonly releaseId?: string;
  readonly runLimit: number | null;
}): Promise<number | null> {
  if (params.runLimit === null || !params.releaseId) {
    return null;
  }

  const [result] = await db
    .select({ value: count() })
    .from(albumArtGenerationSessions)
    .where(
      and(
        eq(albumArtGenerationSessions.profileId, params.profileId),
        eq(albumArtGenerationSessions.releaseId, params.releaseId),
        gt(albumArtGenerationSessions.consumedRuns, 0),
        isNotNull(albumArtGenerationSessions.releaseId)
      )
    );

  return Math.max(0, params.runLimit - Number(result?.value ?? 0));
}

export async function assertAlbumArtQuota(params: {
  readonly profileId: string;
  readonly releaseId?: string;
  readonly runLimit: number | null;
}): Promise<number | null> {
  const remaining = await getRemainingAlbumArtRuns(params);
  if (remaining !== null && remaining <= 0) {
    throw new Error('Album art quota reached for this release');
  }

  return remaining;
}
