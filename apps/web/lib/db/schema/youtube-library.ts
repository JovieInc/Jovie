/**
 * YouTube Video Library — sync substrate (JOV-5136)
 *
 * Local mirror of a creator's YouTube channel videos, their analytics
 * snapshots, thumbnail version history, and ISRC/release linkage.
 *
 * The YouTube OAuth connector is NOT merged yet (JOV-3189) — rows are
 * populated by `lib/youtube-library/sync.ts` once a provider exists.
 *
 * IMMUTABILITY RULE (youtube_thumbnail_versions): rows are never deleted
 * and imageUrl/provenance are never updated; kind may only be relabeled
 * current -> previous. History is append-only for rollback + experiments.
 */

import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { discogRecordings, discogReleases } from './content';
import { creatorProfiles } from './profiles';

// ============================================================================
// Enums (local to this domain — precedent: library-share-drops.ts)
// ============================================================================

export const youtubeVideoContentTypeEnum = pgEnum(
  'youtube_video_content_type',
  ['music_video', 'live_performance', 'lyric_video', 'short', 'vlog', 'other']
);

export const youtubeMetricWindowEnum = pgEnum('youtube_metric_window', [
  'day_1',
  'day_7',
  'day_28',
  'day_90',
  'lifetime',
  'experiment',
]);

export const youtubeThumbnailKindEnum = pgEnum('youtube_thumbnail_kind', [
  'original',
  'previous',
  'current',
  'candidate',
]);

export const youtubeThumbnailApprovalEnum = pgEnum(
  'youtube_thumbnail_approval',
  ['not_required', 'pending', 'approved', 'rejected']
);

export const youtubeReleaseLinkStatusEnum = pgEnum(
  'youtube_release_link_status',
  ['pending_review', 'approved', 'rejected']
);

export const youtubeMatchSourceEnum = pgEnum('youtube_match_source', [
  'distributor_data',
  'first_party_release',
  'manual',
]);

// ============================================================================
// JSONB payload types
// ============================================================================

/** Raw YouTube thumbnail set as returned by the Data API. */
export interface YouTubeThumbnailSet {
  default?: { url: string; width?: number; height?: number };
  medium?: { url: string; width?: number; height?: number };
  high?: { url: string; width?: number; height?: number };
  standard?: { url: string; width?: number; height?: number };
  maxres?: { url: string; width?: number; height?: number };
}

/** Where a thumbnail version came from (immutable once written). */
export interface YouTubeThumbnailProvenance {
  source: 'youtube' | 'generated' | 'rollback';
  generator?: string;
  prompt?: string;
  model?: string;
}

// ============================================================================
// youtube_videos — one row per channel video
// ============================================================================

export const youtubeVideos = pgTable(
  'youtube_videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    channelId: text('channel_id').notNull(),
    videoId: text('video_id').notNull(), // YouTube video ID
    title: text('title').notNull(),
    description: text('description'),
    publishedAt: timestamp('published_at'),
    durationSeconds: integer('duration_seconds'),
    url: text('url').notNull(),
    privacyStatus: text('privacy_status'), // 'public' | 'unlisted' | 'private'
    contentType: youtubeVideoContentTypeEnum('content_type')
      .notNull()
      .default('other'),
    classificationRationale: text('classification_rationale'),
    classificationConfidence: decimal('classification_confidence', {
      precision: 5,
      scale: 4,
    }),
    currentThumbnails: jsonb('current_thumbnails')
      .$type<YouTubeThumbnailSet>()
      .default({}),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    channelVideoUnique: uniqueIndex('youtube_videos_channel_video_unique').on(
      table.channelId,
      table.videoId
    ),
    creatorIdx: index('youtube_videos_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
  })
);

// ============================================================================
// youtube_video_metric_snapshots — append-friendly analytics history
// ============================================================================

export const youtubeVideoMetricSnapshots = pgTable(
  'youtube_video_metric_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => youtubeVideos.id, { onDelete: 'cascade' }),
    window: youtubeMetricWindowEnum('window').notNull(),
    windowStart: timestamp('window_start').notNull(),
    windowEnd: timestamp('window_end').notNull(),
    impressions: integer('impressions'),
    ctr: decimal('ctr', { precision: 7, scale: 6 }),
    views: integer('views'),
    watchTimeMinutes: decimal('watch_time_minutes', {
      precision: 12,
      scale: 2,
    }),
    watchTimePerImpression: decimal('watch_time_per_impression', {
      precision: 12,
      scale: 4,
    }),
    avgViewDurationSeconds: decimal('avg_view_duration_seconds', {
      precision: 10,
      scale: 2,
    }),
    /** Views per traffic source, e.g. { "YT_SEARCH": 123, "EXT_URL": 45 }. */
    trafficSources: jsonb('traffic_sources').$type<Record<string, number>>(),
    /** Revenue in micros; only populated when the OAuth scope authorizes it. */
    revenueMicros: bigint('revenue_micros', { mode: 'number' }),
    currency: text('currency'),
    capturedAt: timestamp('captured_at').defaultNow().notNull(),
  },
  table => ({
    videoWindowRangeUnique: uniqueIndex(
      'youtube_video_metric_snapshots_video_window_range_unique'
    ).on(table.videoId, table.window, table.windowStart, table.windowEnd),
  })
);

// ============================================================================
// youtube_thumbnail_versions — append-only thumbnail history
// ============================================================================

export const youtubeThumbnailVersions = pgTable(
  'youtube_thumbnail_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => youtubeVideos.id, { onDelete: 'cascade' }),
    kind: youtubeThumbnailKindEnum('kind').notNull(),
    imageUrl: text('image_url').notNull(),
    provenance: jsonb('provenance')
      .$type<YouTubeThumbnailProvenance>()
      .notNull(),
    approvalStatus: youtubeThumbnailApprovalEnum('approval_status')
      .notNull()
      .default('not_required'),
    /** App `users.id` of the approver (session user id). */
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at'),
    swappedAt: timestamp('swapped_at'),
    rollbackTargetId: uuid('rollback_target_id').references(
      (): AnyPgColumn => youtubeThumbnailVersions.id
    ),
    experimentId: text('experiment_id'),
    cohortId: text('cohort_id'),
    detectedAt: timestamp('detected_at').defaultNow().notNull(),
  },
  table => ({
    videoIdx: index('youtube_thumbnail_versions_video_id_idx').on(
      table.videoId
    ),
  })
);

// ============================================================================
// youtube_video_release_links — video ↔ release/recording ISRC linkage
// ============================================================================

export const youtubeVideoReleaseLinks = pgTable(
  'youtube_video_release_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => youtubeVideos.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    recordingId: uuid('recording_id').references(() => discogRecordings.id, {
      onDelete: 'cascade',
    }),
    isrc: text('isrc'),
    matchSource: youtubeMatchSourceEnum('match_source').notNull(),
    confidence: decimal('confidence', { precision: 5, scale: 4 }).notNull(),
    status: youtubeReleaseLinkStatusEnum('status')
      .notNull()
      .default('pending_review'),
    /** App `users.id` of the approver (session user id). */
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at'),
    rejectionReason: text('rejection_reason'),
    rationale: text('rationale'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // One link per video
    videoUnique: uniqueIndex('youtube_video_release_links_video_unique').on(
      table.videoId
    ),
  })
);

// ============================================================================
// Schema Validations
// ============================================================================

export const insertYoutubeVideoSchema = createInsertSchema(youtubeVideos);
export const selectYoutubeVideoSchema = createSelectSchema(youtubeVideos);

export const insertYoutubeVideoMetricSnapshotSchema = createInsertSchema(
  youtubeVideoMetricSnapshots
);
export const selectYoutubeVideoMetricSnapshotSchema = createSelectSchema(
  youtubeVideoMetricSnapshots
);

export const insertYoutubeThumbnailVersionSchema = createInsertSchema(
  youtubeThumbnailVersions
);
export const selectYoutubeThumbnailVersionSchema = createSelectSchema(
  youtubeThumbnailVersions
);

export const insertYoutubeVideoReleaseLinkSchema = createInsertSchema(
  youtubeVideoReleaseLinks
);
export const selectYoutubeVideoReleaseLinkSchema = createSelectSchema(
  youtubeVideoReleaseLinks
);

// ============================================================================
// Types
// ============================================================================

export type YoutubeVideo = typeof youtubeVideos.$inferSelect;
export type NewYoutubeVideo = typeof youtubeVideos.$inferInsert;

export type YoutubeVideoMetricSnapshot =
  typeof youtubeVideoMetricSnapshots.$inferSelect;
export type NewYoutubeVideoMetricSnapshot =
  typeof youtubeVideoMetricSnapshots.$inferInsert;

export type YoutubeThumbnailVersion =
  typeof youtubeThumbnailVersions.$inferSelect;
export type NewYoutubeThumbnailVersion =
  typeof youtubeThumbnailVersions.$inferInsert;

export type YoutubeVideoReleaseLink =
  typeof youtubeVideoReleaseLinks.$inferSelect;
export type NewYoutubeVideoReleaseLink =
  typeof youtubeVideoReleaseLinks.$inferInsert;
