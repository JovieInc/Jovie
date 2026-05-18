import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';

interface LoadReleaseTaskRouteReleaseOptions {
  readonly releaseId: string;
  readonly profileId: string;
}

export type ReleaseTaskRouteRelease = NonNullable<
  Awaited<ReturnType<typeof loadReleaseTaskRouteRelease>>
>;

export async function loadReleaseTaskRouteRelease({
  releaseId,
  profileId,
}: LoadReleaseTaskRouteReleaseOptions) {
  const [release] = await db
    .select({
      title: discogReleases.title,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, profileId)
      )
    )
    .limit(1);

  return release ?? null;
}
