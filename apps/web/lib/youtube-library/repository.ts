/**
 * YouTube Library — persistence seam (JOV-5136)
 *
 * All DB access for the sync engine lives behind `YouTubeLibraryRepository`.
 * The default implementation is Drizzle-backed; tests substitute an
 * in-memory implementation so sync logic runs without a database.
 *
 * Hard rules honored here: `db` from '@/lib/db' only, no transactions,
 * batch inserts via `db.insert().values([...])`.
 */

import {
  and,
  sql as drizzleSql,
  eq,
  inArray,
  isNull,
  lt,
  or,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogRecordings, discogReleaseTracks } from '@/lib/db/schema/content';
import type {
  NewYoutubeThumbnailVersion,
  NewYoutubeVideo,
  NewYoutubeVideoMetricSnapshot,
  NewYoutubeVideoReleaseLink,
  YouTubeThumbnailProvenance,
  YoutubeThumbnailVersion,
  YoutubeVideo,
} from '@/lib/db/schema/youtube-library';
import {
  youtubeThumbnailVersions,
  youtubeVideoMetricSnapshots,
  youtubeVideoReleaseLinks,
  youtubeVideos,
} from '@/lib/db/schema/youtube-library';
import type { CatalogRecording } from './isrc';

/** Postgres parameter/row comfort limit for batch writes. */
const BATCH_SIZE = 200;

export interface StaleChannelRef {
  readonly creatorProfileId: string;
  readonly channelId: string;
}

export interface YouTubeLibraryRepository {
  /** All locally-known videos for one creator+channel. */
  listExistingVideos(
    creatorProfileId: string,
    channelId: string
  ): Promise<YoutubeVideo[]>;
  /**
   * Upsert videos on the (channel_id, video_id) unique index. Mutable fields
   * follow the incoming row; classification fields are only adopted when the
   * existing row is still unclassified (classification_rationale IS NULL).
   * Returns the internal id keyed by YouTube video id.
   */
  upsertVideos(rows: NewYoutubeVideo[]): Promise<Map<string, string>>;
  /** Append thumbnail version rows (history is append-only). */
  insertThumbnailVersions(rows: NewYoutubeThumbnailVersion[]): Promise<void>;
  /** Relabel existing versions' kind (only current -> previous is used). */
  relabelThumbnailVersions(
    ids: string[],
    kind: 'previous' | 'current'
  ): Promise<void>;
  /** All thumbnail versions for the given internal video ids. */
  listThumbnailVersions(videoPks: string[]): Promise<YoutubeThumbnailVersion[]>;
  /** Upsert metric snapshots on (video_id, window, window_start, window_end). */
  upsertMetricSnapshots(rows: NewYoutubeVideoMetricSnapshot[]): Promise<void>;
  /** Internal video ids (of the given set) that already have a link row. */
  listLinkedVideoIds(videoPks: string[]): Promise<string[]>;
  /** Creator's catalog recordings with a release id when available. */
  listCatalogRecordings(creatorProfileId: string): Promise<CatalogRecording[]>;
  /** Insert resolved release link rows. */
  insertReleaseLinks(rows: NewYoutubeVideoReleaseLink[]): Promise<void>;
  /** Distinct channels whose last sync is null or older than `cutoff`. */
  listStaleChannels(cutoff: Date): Promise<StaleChannelRef[]>;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export const drizzleYouTubeLibraryRepository: YouTubeLibraryRepository = {
  async listExistingVideos(creatorProfileId, channelId) {
    return db
      .select()
      .from(youtubeVideos)
      .where(
        and(
          eq(youtubeVideos.creatorProfileId, creatorProfileId),
          eq(youtubeVideos.channelId, channelId)
        )
      );
  },

  async upsertVideos(rows) {
    const idByVideoId = new Map<string, string>();
    for (const batch of chunk(rows, BATCH_SIZE)) {
      const returned = await db
        .insert(youtubeVideos)
        .values(batch)
        .onConflictDoUpdate({
          target: [youtubeVideos.channelId, youtubeVideos.videoId],
          set: {
            title: drizzleSql`excluded.title`,
            description: drizzleSql`excluded.description`,
            durationSeconds: drizzleSql`excluded.duration_seconds`,
            privacyStatus: drizzleSql`excluded.privacy_status`,
            currentThumbnails: drizzleSql`excluded.current_thumbnails`,
            lastSyncedAt: drizzleSql`excluded.last_synced_at`,
            updatedAt: drizzleSql`excluded.updated_at`,
            // Re-classify only rows that were never classified.
            contentType: drizzleSql`CASE WHEN youtube_videos.classification_rationale IS NULL THEN excluded.content_type ELSE youtube_videos.content_type END`,
            classificationRationale: drizzleSql`CASE WHEN youtube_videos.classification_rationale IS NULL THEN excluded.classification_rationale ELSE youtube_videos.classification_rationale END`,
            classificationConfidence: drizzleSql`CASE WHEN youtube_videos.classification_rationale IS NULL THEN excluded.classification_confidence ELSE youtube_videos.classification_confidence END`,
          },
        })
        .returning({ id: youtubeVideos.id, videoId: youtubeVideos.videoId });
      for (const row of returned) {
        idByVideoId.set(row.videoId, row.id);
      }
    }
    return idByVideoId;
  },

  async insertThumbnailVersions(rows) {
    for (const batch of chunk(rows, BATCH_SIZE)) {
      await db.insert(youtubeThumbnailVersions).values(batch);
    }
  },

  async relabelThumbnailVersions(ids, kind) {
    for (const batch of chunk(ids, BATCH_SIZE)) {
      await db
        .update(youtubeThumbnailVersions)
        .set({ kind })
        .where(inArray(youtubeThumbnailVersions.id, batch));
    }
  },

  async listThumbnailVersions(videoPks) {
    if (videoPks.length === 0) return [];
    return db
      .select()
      .from(youtubeThumbnailVersions)
      .where(inArray(youtubeThumbnailVersions.videoId, videoPks));
  },

  async upsertMetricSnapshots(rows) {
    for (const batch of chunk(rows, BATCH_SIZE)) {
      await db
        .insert(youtubeVideoMetricSnapshots)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            youtubeVideoMetricSnapshots.videoId,
            youtubeVideoMetricSnapshots.window,
            youtubeVideoMetricSnapshots.windowStart,
            youtubeVideoMetricSnapshots.windowEnd,
          ],
          set: {
            impressions: drizzleSql`excluded.impressions`,
            ctr: drizzleSql`excluded.ctr`,
            views: drizzleSql`excluded.views`,
            watchTimeMinutes: drizzleSql`excluded.watch_time_minutes`,
            watchTimePerImpression: drizzleSql`excluded.watch_time_per_impression`,
            avgViewDurationSeconds: drizzleSql`excluded.avg_view_duration_seconds`,
            trafficSources: drizzleSql`excluded.traffic_sources`,
            revenueMicros: drizzleSql`excluded.revenue_micros`,
            currency: drizzleSql`excluded.currency`,
            capturedAt: drizzleSql`excluded.captured_at`,
          },
        });
    }
  },

  async listLinkedVideoIds(videoPks) {
    if (videoPks.length === 0) return [];
    const rows = await db
      .select({ videoId: youtubeVideoReleaseLinks.videoId })
      .from(youtubeVideoReleaseLinks)
      .where(inArray(youtubeVideoReleaseLinks.videoId, videoPks));
    return rows.map(r => r.videoId);
  },

  async listCatalogRecordings(creatorProfileId) {
    const rows = await db
      .select({
        id: discogRecordings.id,
        isrc: discogRecordings.isrc,
        title: discogRecordings.title,
        releaseId: discogReleaseTracks.releaseId,
      })
      .from(discogRecordings)
      .leftJoin(
        discogReleaseTracks,
        eq(discogReleaseTracks.recordingId, discogRecordings.id)
      )
      .where(eq(discogRecordings.creatorProfileId, creatorProfileId));

    // A recording can appear on multiple releases; keep the first release id.
    const byRecording = new Map<string, CatalogRecording>();
    for (const row of rows) {
      const existing = byRecording.get(row.id);
      if (!existing) {
        byRecording.set(row.id, row);
      } else if (!existing.releaseId && row.releaseId) {
        byRecording.set(row.id, { ...existing, releaseId: row.releaseId });
      }
    }
    return [...byRecording.values()];
  },

  async insertReleaseLinks(rows) {
    for (const batch of chunk(rows, BATCH_SIZE)) {
      await db.insert(youtubeVideoReleaseLinks).values(batch);
    }
  },

  async listStaleChannels(cutoff) {
    return db
      .selectDistinct({
        creatorProfileId: youtubeVideos.creatorProfileId,
        channelId: youtubeVideos.channelId,
      })
      .from(youtubeVideos)
      .where(
        or(
          isNull(youtubeVideos.lastSyncedAt),
          lt(youtubeVideos.lastSyncedAt, cutoff)
        )
      );
  },
};

/**
 * Insert a kind='candidate' thumbnail version awaiting human approval.
 * Used by the MCP `register_thumbnail_version` tool; never performs a
 * YouTube-side swap (that is JOV-3935).
 */
export async function insertThumbnailCandidate(row: {
  videoId: string;
  imageUrl: string;
  provenance: YouTubeThumbnailProvenance;
  experimentId?: string | null;
  cohortId?: string | null;
}): Promise<{ id: string }> {
  const [inserted] = await db
    .insert(youtubeThumbnailVersions)
    .values({
      videoId: row.videoId,
      kind: 'candidate',
      imageUrl: row.imageUrl,
      provenance: row.provenance,
      approvalStatus: 'pending',
      experimentId: row.experimentId ?? null,
      cohortId: row.cohortId ?? null,
    })
    .returning({ id: youtubeThumbnailVersions.id });
  return inserted;
}
