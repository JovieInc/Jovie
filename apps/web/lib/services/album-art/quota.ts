import 'server-only';

import { and, eq, gt, sum } from 'drizzle-orm';
import { db } from '@/lib/db';
import { albumArtGenerationSessions } from '@/lib/db/schema/album-art';

export async function getRemainingAlbumArtRuns(params: {
  readonly profileId: string;
  readonly releaseId?: string;
  readonly draftKey?: string;
  readonly runLimit: number | null;
}): Promise<number | null> {
  if (params.runLimit === null) {
    return null;
  }

  const scopeFilter = params.releaseId
    ? eq(albumArtGenerationSessions.releaseId, params.releaseId)
    : params.draftKey
      ? eq(albumArtGenerationSessions.draftKey, params.draftKey)
      : null;

  if (!scopeFilter) {
    return null;
  }

  const [result] = await db
    .select({ value: sum(albumArtGenerationSessions.consumedRuns) })
    .from(albumArtGenerationSessions)
    .where(
      and(
        eq(albumArtGenerationSessions.profileId, params.profileId),
        scopeFilter,
        gt(albumArtGenerationSessions.consumedRuns, 0)
      )
    );

  return Math.max(0, params.runLimit - Number(result?.value ?? 0));
}

export async function assertAlbumArtQuota(params: {
  readonly profileId: string;
  readonly releaseId?: string;
  readonly draftKey?: string;
  readonly runLimit: number | null;
}): Promise<number | null> {
  const remaining = await getRemainingAlbumArtRuns(params);
  if (remaining !== null && remaining <= 0) {
    throw new Error('Album art quota reached for this release');
  }

  return remaining;
}
