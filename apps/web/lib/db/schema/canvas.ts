import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { discogReleases, discogReleaseTracks, discogTracks } from './content';
import { creatorProfiles } from './profiles';

export const canvasImageMasters = pgTable(
  'canvas_image_masters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    sourceArtworkUrl: text('source_artwork_url').notNull(),
    sourceArtworkFingerprint: text('source_artwork_fingerprint').notNull(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    processedImagePath: text('processed_image_path').notNull(),
    previewImagePath: text('preview_image_path').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    manifestPath: text('manifest_path').notNull(),
    qc: jsonb('qc').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    fingerprintUnique: uniqueIndex(
      'canvas_image_masters_creator_fingerprint_unique'
    ).on(table.creatorProfileId, table.sourceArtworkFingerprint),
    releaseIdx: index('canvas_image_masters_release_id_idx').on(
      table.releaseId
    ),
  })
);

export const trackCanvasState = pgTable(
  'track_canvas_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseTrackId: uuid('release_track_id').references(
      () => discogReleaseTracks.id,
      {
        onDelete: 'cascade',
      }
    ),
    legacyTrackId: uuid('legacy_track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    currentGenerationId: uuid('current_generation_id'),
    uploadedGenerationId: uuid('uploaded_generation_id'),
    status: text('status').notNull(),
    lastError: text('last_error'),
    lastGeneratedAt: timestamp('last_generated_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseTrackUnique: uniqueIndex('track_canvas_state_release_track_unique')
      .on(table.releaseTrackId)
      .where(drizzleSql`release_track_id IS NOT NULL`),
    legacyTrackUnique: uniqueIndex('track_canvas_state_legacy_track_unique')
      .on(table.legacyTrackId)
      .where(drizzleSql`legacy_track_id IS NOT NULL`),
    releaseIdx: index('track_canvas_state_release_id_idx').on(table.releaseId),
    creatorStatusIdx: index('track_canvas_state_creator_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
    trackRefCheck: check(
      'track_canvas_state_track_ref_check',
      drizzleSql`num_nonnulls(release_track_id, legacy_track_id) = 1`
    ),
  })
);

export const canvasGenerations = pgTable(
  'canvas_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseTrackId: uuid('release_track_id').references(
      () => discogReleaseTracks.id,
      {
        onDelete: 'cascade',
      }
    ),
    legacyTrackId: uuid('legacy_track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    imageMasterId: uuid('image_master_id').references(
      () => canvasImageMasters.id,
      {
        onDelete: 'set null',
      }
    ),
    status: text('status').notNull(),
    stage: text('stage').notNull(),
    motionPreset: text('motion_preset').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    durationSec: integer('duration_sec').notNull(),
    loopStrategy: text('loop_strategy').notNull(),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    qc: jsonb('qc').$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
  },
  table => ({
    releaseTrackCreatedIdx: index(
      'canvas_generations_release_track_created_idx'
    ).on(table.releaseTrackId, table.createdAt),
    legacyTrackCreatedIdx: index(
      'canvas_generations_legacy_track_created_idx'
    ).on(table.legacyTrackId, table.createdAt),
    creatorStatusIdx: index('canvas_generations_creator_status_idx').on(
      table.creatorProfileId,
      table.status
    ),
    trackRefCheck: check(
      'canvas_generations_track_ref_check',
      drizzleSql`num_nonnulls(release_track_id, legacy_track_id) = 1`
    ),
  })
);

export const canvasArtifacts = pgTable(
  'canvas_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => canvasGenerations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    fileSizeBytes: integer('file_size_bytes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    generationKindIdx: index('canvas_artifacts_generation_kind_idx').on(
      table.generationId,
      table.kind
    ),
  })
);

export type CanvasImageMaster = typeof canvasImageMasters.$inferSelect;
export type NewCanvasImageMaster = typeof canvasImageMasters.$inferInsert;
export type TrackCanvasState = typeof trackCanvasState.$inferSelect;
export type NewTrackCanvasState = typeof trackCanvasState.$inferInsert;
export type CanvasGeneration = typeof canvasGenerations.$inferSelect;
export type NewCanvasGeneration = typeof canvasGenerations.$inferInsert;
export type CanvasArtifact = typeof canvasArtifacts.$inferSelect;
export type NewCanvasArtifact = typeof canvasArtifacts.$inferInsert;
