import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { ingestionJobStatusEnum, scraperStrategyEnum } from './enums';

// Ingestion jobs table
export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobType: text('job_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: ingestionJobStatusEnum('status').default('pending').notNull(),
    error: text('error'),
    attempts: integer('attempts').default(0).notNull(),
    runAt: timestamp('run_at').defaultNow().notNull(),
    priority: integer('priority').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    nextRunAt: timestamp('next_run_at'),
    dedupKey: text('dedup_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique index for job deduplication
    dedupKeyUnique: uniqueIndex('idx_ingestion_jobs_dedup_key_unique')
      .on(table.dedupKey)
      .where(sql`dedup_key IS NOT NULL`),
    // Index for job processing queries
    statusRunAtIdx: index('idx_ingestion_jobs_status_run_at').on(
      table.status,
      table.runAt
    ),
  })
);

// Scraper configs table
export const scraperConfigs = pgTable('scraper_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  network: text('network').notNull(),
  strategy: scraperStrategyEnum('strategy').default('http').notNull(),
  maxConcurrency: integer('max_concurrency').default(1).notNull(),
  maxJobsPerMinute: integer('max_jobs_per_minute').default(30).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Schema validations
export const insertIngestionJobSchema = createInsertSchema(ingestionJobs);
export const selectIngestionJobSchema = createSelectSchema(ingestionJobs);

export const insertScraperConfigSchema = createInsertSchema(scraperConfigs);
export const selectScraperConfigSchema = createSelectSchema(scraperConfigs);

// Types
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;

export type ScraperConfig = typeof scraperConfigs.$inferSelect;
export type NewScraperConfig = typeof scraperConfigs.$inferInsert;
