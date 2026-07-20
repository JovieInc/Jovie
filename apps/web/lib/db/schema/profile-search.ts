import { sql as drizzleSql } from 'drizzle-orm';
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
import { profileSurfaces } from './profile-surfaces';
import { creatorProfiles } from './profiles';

/** Server-only provider kill switch, separate from user-facing rollout flags. */
export const profileSearchProviderHealth = pgTable(
  'profile_search_provider_health',
  {
    provider: text('provider').primaryKey(),
    enabled: boolean('enabled').default(false).notNull(),
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    disabledReason: text('disabled_reason'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  }
);

/** One exact-name/home-market/desktop schedule per artist. */
export const profileSearchQueries = pgTable(
  'profile_search_queries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    provider: text('provider').default('google_serpapi').notNull(),
    queryText: text('query_text').notNull(),
    market: text('market').default('US').notNull(),
    locale: text('locale').default('en').notNull(),
    device: text('device').default('desktop').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastSucceededAt: timestamp('last_succeeded_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('profile_search_queries_profile_provider_uniq').on(
      table.creatorProfileId,
      table.provider
    ),
    index('profile_search_queries_due_idx')
      .on(table.nextRunAt, table.creatorProfileId)
      .where(drizzleSql`enabled = true`),
  ]
);

/** Durable attempt intent; state advances before and after provider I/O. */
export const profileSearchRuns = pgTable(
  'profile_search_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queryId: uuid('query_id')
      .notNull()
      .references(() => profileSearchQueries.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    state: text('state').default('intent').notNull(),
    attemptKind: text('attempt_kind').default('scheduled').notNull(),
    requestIssuedAt: timestamp('request_issued_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    latencyMs: integer('latency_ms'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    comparable: boolean('comparable').default(false).notNull(),
    usage: jsonb('usage')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('profile_search_runs_query_fetched_idx').on(
      table.queryId,
      table.fetchedAt
    ),
    index('profile_search_runs_state_created_idx').on(
      table.state,
      table.createdAt
    ),
  ]
);

/** Top-ten organic evidence retained for a specific run. */
export const profileSearchResults = pgTable(
  'profile_search_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => profileSearchRuns.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    snippet: text('snippet'),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    classification: text('classification').default('unknown').notNull(),
    surfaceId: uuid('surface_id').references(() => profileSurfaces.id, {
      onDelete: 'set null',
    }),
    evidence: jsonb('evidence')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('profile_search_results_run_position_uniq').on(
      table.runId,
      table.position
    ),
    index('profile_search_results_run_url_idx').on(
      table.runId,
      table.normalizedUrl
    ),
    index('profile_search_results_surface_idx').on(
      table.surfaceId,
      table.createdAt
    ),
  ]
);

/** Minimal deterministic recommendation lifecycle for surface issues. */
export const profileSurfaceIssues = pgTable(
  'profile_surface_issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    surfaceId: uuid('surface_id').references(() => profileSurfaces.id, {
      onDelete: 'cascade',
    }),
    issueType: text('issue_type').notNull(),
    state: text('state').default('detected').notNull(),
    severity: text('severity').default('low').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    evidenceRunId: uuid('evidence_run_id').references(
      () => profileSearchRuns.id,
      { onDelete: 'set null' }
    ),
    primaryUrl: text('primary_url'),
    actedAt: timestamp('acted_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('profile_surface_issues_idempotency_uniq').on(
      table.idempotencyKey
    ),
    index('profile_surface_issues_unresolved_idx')
      .on(table.creatorProfileId, table.severity, table.updatedAt)
      .where(drizzleSql`resolved_at IS NULL`),
  ]
);

export type ProfileSearchQuery = typeof profileSearchQueries.$inferSelect;
export type ProfileSearchRun = typeof profileSearchRuns.$inferSelect;
export type ProfileSearchResult = typeof profileSearchResults.$inferSelect;
export type ProfileSurfaceIssue = typeof profileSurfaceIssues.$inferSelect;
