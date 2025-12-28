import {
  boolean,
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

/**
 * Infrastructure domain schema.
 * System utilities, job queues, idempotency keys, and link wrapping.
 * No external domain dependencies - self-contained infrastructure tables.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Status for background ingestion jobs.
 */
export const ingestionJobStatusEnum = pgEnum('ingestion_job_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
]);

/**
 * Strategy for web scraping operations.
 */
export const scraperStrategyEnum = pgEnum('scraper_strategy', [
  'http',
  'browser',
  'api',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Dashboard idempotency keys - prevents duplicate API operations.
 * Used for dashboard API deduplication to ensure exactly-once processing.
 */
export const dashboardIdempotencyKeys = pgTable(
  'dashboard_idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    userId: text('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    keyUserEndpointUnique: uniqueIndex(
      'dashboard_idempotency_keys_key_user_endpoint_unique'
    ).on(table.key, table.userId, table.endpoint),
    expiresAtIndex: index('dashboard_idempotency_keys_expires_at_idx').on(
      table.expiresAt
    ),
  })
);

/**
 * Signed link access - tracks signed URL usage for secure link sharing.
 * Supports one-time use links with expiration.
 */
export const signedLinkAccess = pgTable('signed_link_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: text('link_id').notNull(),
  signedToken: text('signed_token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  isUsed: boolean('is_used').default(false),
  usedAt: timestamp('used_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Wrapped links - URL shortening and encryption for sensitive links.
 * Supports both normal and sensitive link types with optional expiration.
 */
export const wrappedLinks = pgTable('wrapped_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortId: text('short_id').notNull().unique(),
  encryptedUrl: text('encrypted_url').notNull(),
  kind: text('kind').notNull(), // 'normal' | 'sensitive'
  domain: text('domain').notNull(),
  category: text('category'),
  titleAlias: text('title_alias'),
  clickCount: integer('click_count').default(0),
  createdBy: text('created_by'), // Clerk user ID
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Ingestion jobs - background job queue for data ingestion tasks.
 * Supports priority, retries, and deduplication via dedupKey.
 */
export const ingestionJobs = pgTable('ingestion_jobs', {
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
});

/**
 * Scraper configs - per-network configuration for web scraping.
 * Controls concurrency, rate limits, and scraping strategy per platform.
 */
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
