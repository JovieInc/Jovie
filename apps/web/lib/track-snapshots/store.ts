import 'server-only';
import { and, sql as drizzleSql, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clickEvents } from '@/lib/db/schema/analytics';
import {
  discogReleases,
  discogTracks,
  providerLinks,
} from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { trackDailySnapshots } from '@/lib/db/schema/track-daily-snapshots';
import { parseYouTubeVideoId } from './contract';
import type {
  ReleaseClickCounts,
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
          releaseId: discogTracks.releaseId,
          trackId: discogTracks.id,
          spotifyTrackId: drizzleSql<
            string | null
          >`${discogTracks.metadata} ->> 'spotify_track_id'`,
        })
        .from(discogTracks)
        .where(inArray(discogTracks.releaseId, releaseIds)),
      db
        .select({
          releaseId: providerLinks.releaseId,
          trackId: providerLinks.trackId,
          trackReleaseId: discogTracks.releaseId,
          url: providerLinks.url,
        })
        .from(providerLinks)
        .leftJoin(discogTracks, eq(discogTracks.id, providerLinks.trackId))
        .where(inArray(providerLinks.providerId, YOUTUBE_PROVIDERS)),
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

  async releaseClicks(creatorProfileId, priorDay) {
    const result = await db.execute<{
      release_id: string;
      total: string | number;
      prior_day: string | number;
    }>(drizzleSql`
      select ${clickEvents.metadata} ->> 'contentId' as release_id,
             count(*) as total,
             count(*) filter (where ${clickEvents.createdAt}::date = ${priorDay}::date) as prior_day
      from ${clickEvents}
      where ${clickEvents.creatorProfileId} = ${creatorProfileId}
        and ${clickEvents.isBot} = false
        and ${clickEvents.metadata} ->> 'contentType' = 'release'
        and ${clickEvents.metadata} ->> 'contentId' is not null
      group by 1
    `);
    const map = new Map<string, ReleaseClickCounts>();
    for (const row of result.rows ?? []) {
      map.set(row.release_id, {
        total: Number(row.total),
        priorDay: Number(row.prior_day),
      });
    }
    return map;
  },

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
