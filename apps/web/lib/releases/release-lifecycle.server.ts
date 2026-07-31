import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';

export type ReleaseLifecycleState =
  | {
      readonly status: 'active';
      readonly archivedAt: null;
    }
  | {
      readonly status: 'archived';
      readonly archivedAt: Date;
    };

export function readReleaseLifecycleState(release: {
  readonly deletedAt?: Date | string | null;
}): ReleaseLifecycleState {
  if (!release.deletedAt) {
    return { status: 'active', archivedAt: null };
  }

  return {
    status: 'archived',
    archivedAt:
      release.deletedAt instanceof Date
        ? release.deletedAt
        : new Date(release.deletedAt),
  };
}

async function writeReleaseArchivedAt(input: {
  readonly releaseId: string;
  readonly creatorProfileId: string;
  readonly archivedAt: Date | null;
}): Promise<ReleaseLifecycleState> {
  const now = new Date();
  const [release] = await db
    .update(discogReleases)
    .set({
      deletedAt: input.archivedAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(discogReleases.id, input.releaseId),
        eq(discogReleases.creatorProfileId, input.creatorProfileId)
      )
    )
    .returning({ deletedAt: discogReleases.deletedAt });

  if (!release) {
    throw new TypeError('Release not found');
  }

  return readReleaseLifecycleState(release);
}

export function archiveRelease(input: {
  readonly releaseId: string;
  readonly creatorProfileId: string;
}): Promise<ReleaseLifecycleState> {
  return writeReleaseArchivedAt({
    ...input,
    archivedAt: new Date(),
  });
}

export function restoreRelease(input: {
  readonly releaseId: string;
  readonly creatorProfileId: string;
}): Promise<ReleaseLifecycleState> {
  return writeReleaseArchivedAt({
    ...input,
    archivedAt: null,
  });
}
