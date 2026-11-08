import type { TrackDailySnapshotSource } from '@/lib/db/schema/track-daily-snapshots';
import { utcDay, utcPreviousDay } from './contract';

export interface SnapshotTrackRef {
  readonly releaseId: string;
  readonly trackId: string;
  readonly spotifyTrackId: string | null;
}

export interface SnapshotVideoRef {
  readonly releaseId: string;
  /** Null when the video link belongs to the release. */
  readonly trackId: string | null;
  readonly videoId: string;
}

export interface SnapshotCatalog {
  readonly creatorProfileId: string;
  readonly releaseIds: readonly string[];
  readonly tracks: readonly SnapshotTrackRef[];
  readonly videos: readonly SnapshotVideoRef[];
}

export interface ReleaseClickCounts {
  readonly total: number;
  readonly priorDay: number;
}

export interface TrackSnapshotRow {
  readonly creatorProfileId: string;
  readonly releaseId: string;
  readonly trackId: string | null;
  readonly source: TrackDailySnapshotSource;
  readonly snapshotDay: string;
  readonly fetchedAt: Date;
  readonly values: Record<string, unknown>;
}

export interface TrackSnapshotStore {
  listProfileIds(usernames: readonly string[]): Promise<readonly string[]>;
  loadCatalog(creatorProfileId: string): Promise<SnapshotCatalog>;
  releaseClicks(
    creatorProfileId: string,
    priorDay: string
  ): Promise<ReadonlyMap<string, ReleaseClickCounts>>;
  /** Returns the number of rows newly inserted (conflicts are skipped). */
  insertMany(rows: readonly TrackSnapshotRow[]): Promise<number>;
}

export interface TrackSnapshotFetchers {
  /** spotify track id -> popularity (0-100). Missing ids are omitted. */
  spotifyPopularity(
    ids: readonly string[]
  ): Promise<ReadonlyMap<string, number>>;
  /** youtube video id -> public view count. Missing ids are omitted. */
  youtubeViews(ids: readonly string[]): Promise<ReadonlyMap<string, number>>;
}

export interface TrackSnapshotFailure {
  readonly creatorProfileId: string | null;
  readonly source: TrackDailySnapshotSource | 'catalog';
  readonly reason: string;
}

export interface TrackSnapshotReport {
  readonly day: string;
  readonly profiles: number;
  readonly rowsAttempted: number;
  readonly rowsInserted: number;
  readonly attemptedBySource: Record<TrackDailySnapshotSource, number>;
  readonly failures: readonly TrackSnapshotFailure[];
}

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];

export async function runTrackDailySnapshots(input: {
  readonly now: Date;
  readonly usernames: readonly string[];
  readonly store: TrackSnapshotStore;
  readonly fetchers: TrackSnapshotFetchers;
}): Promise<TrackSnapshotReport> {
  const { now, store, fetchers } = input;
  const day = utcDay(now);
  const priorDay = utcPreviousDay(day);
  const failures: TrackSnapshotFailure[] = [];
  const attemptedBySource: Record<TrackDailySnapshotSource, number> = {
    spotify_popularity: 0,
    youtube_views: 0,
    jovie_release: 0,
  };
  let rowsAttempted = 0;
  let rowsInserted = 0;

  const profileIds = await store.listProfileIds(input.usernames);
  for (const creatorProfileId of profileIds) {
    const rows: TrackSnapshotRow[] = [];
    const base = { creatorProfileId, snapshotDay: day, fetchedAt: now };
    let catalog: SnapshotCatalog;
    try {
      catalog = await store.loadCatalog(creatorProfileId);
    } catch (error) {
      failures.push({
        creatorProfileId,
        source: 'catalog',
        reason: error instanceof Error ? error.message : 'catalog_load_failed',
      });
      continue;
    }

    try {
      const ids = unique(
        catalog.tracks.flatMap(t =>
          t.spotifyTrackId ? [t.spotifyTrackId] : []
        )
      );
      const popularity = ids.length
        ? await fetchers.spotifyPopularity(ids)
        : new Map<string, number>();
      for (const track of catalog.tracks) {
        const value = track.spotifyTrackId
          ? popularity.get(track.spotifyTrackId)
          : undefined;
        if (value === undefined) continue;
        rows.push({
          ...base,
          releaseId: track.releaseId,
          trackId: track.trackId,
          source: 'spotify_popularity',
          values: {
            popularity: value,
            spotifyTrackId: track.spotifyTrackId,
            api: 'spotify-web-api',
            precision: 'index_0_100',
          },
        });
      }
    } catch (error) {
      failures.push({
        creatorProfileId,
        source: 'spotify_popularity',
        reason: error instanceof Error ? error.message : 'spotify_failed',
      });
    }

    try {
      const ids = unique(catalog.videos.map(v => v.videoId));
      const views = ids.length
        ? await fetchers.youtubeViews(ids)
        : new Map<string, number>();
      // One row per owner and day: sum views when an owner links several videos.
      const byOwner = new Map<
        string,
        { ref: SnapshotVideoRef; views: number; videoIds: string[] }
      >();
      for (const video of catalog.videos) {
        const value = views.get(video.videoId);
        if (value === undefined) continue;
        const key = `${video.releaseId}:${video.trackId ?? ''}`;
        const entry = byOwner.get(key) ?? {
          ref: video,
          views: 0,
          videoIds: [],
        };
        if (!entry.videoIds.includes(video.videoId)) {
          entry.views += value;
          entry.videoIds.push(video.videoId);
        }
        byOwner.set(key, entry);
      }
      for (const entry of byOwner.values()) {
        rows.push({
          ...base,
          releaseId: entry.ref.releaseId,
          trackId: entry.ref.trackId,
          source: 'youtube_views',
          values: {
            viewCount: entry.views,
            videoIds: entry.videoIds,
            api: 'youtube-data-api-v3',
            precision: 'exact',
          },
        });
      }
    } catch (error) {
      failures.push({
        creatorProfileId,
        source: 'youtube_views',
        reason: error instanceof Error ? error.message : 'youtube_failed',
      });
    }

    try {
      const clicks = await store.releaseClicks(creatorProfileId, priorDay);
      for (const releaseId of catalog.releaseIds) {
        const counts = clicks.get(releaseId) ?? { total: 0, priorDay: 0 };
        rows.push({
          ...base,
          releaseId,
          trackId: null,
          source: 'jovie_release',
          values: {
            clicksTotal: counts.total,
            clicksPriorDay: counts.priorDay,
            priorDay,
            // No per-release page-view event exists yet; never infer one.
            viewsTotal: null,
            botsExcluded: true,
          },
        });
      }
    } catch (error) {
      failures.push({
        creatorProfileId,
        source: 'jovie_release',
        reason: error instanceof Error ? error.message : 'jovie_failed',
      });
    }

    if (rows.length === 0) continue;
    rowsAttempted += rows.length;
    try {
      rowsInserted += await store.insertMany(rows);
      for (const row of rows) attemptedBySource[row.source] += 1;
    } catch (error) {
      failures.push({
        creatorProfileId,
        source: 'catalog',
        reason: error instanceof Error ? error.message : 'insert_failed',
      });
    }
  }

  return {
    day,
    profiles: profileIds.length,
    rowsAttempted,
    rowsInserted,
    attemptedBySource,
    failures,
  };
}
