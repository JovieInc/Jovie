import 'server-only';
import { and, sql as drizzleSql, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getReleaseClickCounts } from '@/lib/db/queries/analytics';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  discogTracks,
  providerLinks,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { trackDailySnapshots } from '@/lib/db/schema/track-daily-snapshots';
import { parseYouTubeVideoId } from './contract';
import type {
  SnapshotCatalog,
  SnapshotVideoRef,
  TrackSnapshotStore,
} from './run';

const YOUTUBE_PROVIDERS = ['youtube', 'youtube_music'];

export const drizzleTrackSnapshotStore: TrackSnapshotStore = {
  async listProfileIds(usernames) {
    if (usernames.length === 0) return [];
    const rows = await db
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(inArray(creatorProfiles.usernameNormalized, [...usernames]));
    return rows.map(row => row.id);
  },

  async loadCatalog(creatorProfileId): Promise<SnapshotCatalog> {
    const releases = await db
      .select({ id: discogReleases.id })
      .from(discogReleases)
      .where(
        and(
          eq(discogReleases.creatorProfileId, creatorProfileId),
          isNull(discogReleases.deletedAt)
        )
      );
    const releaseIds = releases.map(row => row.id);
    if (releaseIds.length === 0) {
      return { creatorProfileId, releaseIds, tracks: [], videos: [] };
    }
    const [tracks, links] = await Promise.all([
      db
        .select({
          releaseId: discogReleaseTracks.releaseId,
          trackId: discogReleaseTracks.id,
          spotifyTrackId: drizzleSql<
            string | null
          >`coalesce(${discogReleaseTracks.metadata} ->> 'spotifyId', ${discogRecordings.metadata} ->> 'spotifyId')`,
        })
        .from(discogReleaseTracks)
        .innerJoin(
          discogRecordings,
          eq(discogRecordings.id, discogReleaseTracks.recordingId)
        )
        .where(
          and(
            inArray(discogReleaseTracks.releaseId, releaseIds),
            eq(discogRecordings.creatorProfileId, creatorProfileId)
          )
        ),
      db
        .select({
          releaseId: providerLinks.releaseId,
          trackId: discogReleaseTracks.id,
          trackReleaseId: discogReleaseTracks.releaseId,
          url: providerLinks.url,
        })
        .from(providerLinks)
        .leftJoin(discogTracks, eq(discogTracks.id, providerLinks.trackId))
        .leftJoin(
          discogReleaseTracks,
          or(
            eq(discogReleaseTracks.id, providerLinks.releaseTrackId),
            and(
              eq(discogReleaseTracks.releaseId, discogTracks.releaseId),
              eq(discogReleaseTracks.slug, discogTracks.slug)
            )
          )
        )
        .where(
          and(
            inArray(providerLinks.providerId, YOUTUBE_PROVIDERS),
            or(
              inArray(providerLinks.releaseId, releaseIds),
              inArray(discogReleaseTracks.releaseId, releaseIds)
            )
          )
        ),
    ]);
    const owned = new Set(releaseIds);
    const videos: SnapshotVideoRef[] = [];
    for (const link of links) {
      const releaseId = link.releaseId ?? link.trackReleaseId;
      if (!releaseId || !owned.has(releaseId)) continue;
      const videoId = parseYouTubeVideoId(link.url);
      if (!videoId) continue;
      videos.push({ releaseId, trackId: link.trackId ?? null, videoId });
    }
    return { creatorProfileId, releaseIds, tracks, videos };
  },

  releaseClicks: getReleaseClickCounts,

  async insertMany(rows) {
    if (rows.length === 0) return 0;
    const inserted = await db
      .insert(trackDailySnapshots)
      .values(rows.map(row => ({ ...row })))
      .onConflictDoNothing()
      .returning({ id: trackDailySnapshots.id });
    return inserted.length;
  },
};
