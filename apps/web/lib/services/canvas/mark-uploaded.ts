import 'server-only';

import { eq } from 'drizzle-orm';
import {
  fetchReleasesForChat,
  findReleaseByTitle,
  formatAvailableReleases,
} from '@/lib/chat/tools/shared';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { buildCanvasMetadata } from '@/lib/services/canvas/service';
import type { CanvasStatus } from '@/lib/services/canvas/types';

export async function markCanvasUploadedForRelease(params: {
  readonly profileId: string;
  readonly releaseTitle: string;
}): Promise<{
  readonly title: string;
  readonly previousStatus: CanvasStatus;
  readonly newStatus: 'uploaded';
}> {
  const releases = await fetchReleasesForChat(params.profileId);
  const release = findReleaseByTitle(releases, params.releaseTitle);

  if (!release) {
    throw new Error(
      `Release "${params.releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`
    );
  }

  await db
    .update(discogReleases)
    .set({
      metadata: {
        ...release.metadata,
        ...buildCanvasMetadata('uploaded'),
      },
      updatedAt: new Date(),
    })
    .where(eq(discogReleases.id, release.id));

  return {
    title: release.title,
    previousStatus: release.canvasStatus,
    newStatus: 'uploaded',
  };
}
