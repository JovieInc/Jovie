import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { discogReleases } from './content';
import { reelJobStatusEnum, reelPackStatusEnum } from './enums';
import { creatorProfiles } from './profiles';

export type ReelTemplateInputs = {
  artistName: string;
  releaseTitle: string;
  releaseDate: string | null;
  artworkUrl: string | null;
  watermark: boolean;
  // Phase 3 additions — optional so existing Phase 2 teaser rows stay valid.
  lyricHook?: string | null;
  waveformPeaks?: readonly number[] | null;
  previewAudioUrl?: string | null;
};

export const reelPacks = pgTable(
  'reel_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    status: reelPackStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  table => ({
    releaseCreatedIdx: index('reel_packs_release_created_at_idx').on(
      table.releaseId,
      table.createdAt
    ),
    creatorIdx: index('reel_packs_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
  })
);

export const reelJobs = pgTable(
  'reel_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    packId: uuid('pack_id').references(() => reelPacks.id, {
      onDelete: 'cascade',
    }),
    templateSlug: text('template_slug').notNull().default('teaser-v1'),
    format: text('format').notNull().default('teaser-v1'),
    status: reelJobStatusEnum('status').notNull().default('queued'),
    error: text('error'),
    outputUrl: text('output_url'),
    durationMs: integer('duration_ms'),
    templateInputs: jsonb('template_inputs')
      .$type<ReelTemplateInputs>()
      .notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    statusCreatedIdx: index('reel_jobs_status_created_at_idx').on(
      table.status,
      table.createdAt
    ),
    releaseIdx: index('reel_jobs_release_id_idx').on(table.releaseId),
    creatorIdx: index('reel_jobs_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    packIdx: index('reel_jobs_pack_id_idx').on(table.packId),
  })
);

export const insertReelJobSchema = createInsertSchema(reelJobs);
export const selectReelJobSchema = createSelectSchema(reelJobs);
export type ReelJob = typeof reelJobs.$inferSelect;
export type NewReelJob = typeof reelJobs.$inferInsert;

export const insertReelPackSchema = createInsertSchema(reelPacks);
export const selectReelPackSchema = createSelectSchema(reelPacks);
export type ReelPack = typeof reelPacks.$inferSelect;
export type NewReelPack = typeof reelPacks.$inferInsert;
