import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { getCanvasStatusFromMetadata } from '@/lib/services/canvas/service';
import { toISOStringOrNull } from '@/lib/utils/date';
import type { ReleaseContext } from './types';

/**
 * Fetches release data for chat context (creative tools, canvas, pitches, etc.).
 * Call once per chat turn and pass the result into tool factories.
 */
export async function fetchReleasesForChat(
  profileId: string
): Promise<ReleaseContext[]> {
  const releases = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
      spotifyPopularity: discogReleases.spotifyPopularity,
      totalTracks: discogReleases.totalTracks,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(eq(discogReleases.creatorProfileId, profileId))
    .orderBy(desc(discogReleases.releaseDate))
    .limit(50);

  return releases.map(release => ({
    ...release,
    releaseDate: toISOStringOrNull(release.releaseDate),
    canvasStatus: getCanvasStatusFromMetadata(release.metadata),
  }));
}
