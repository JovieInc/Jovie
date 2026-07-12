/**
 * Agent Registry Schema — Skills Catalog, Tools Catalog, Retouch Jobs,
 * skill version history, and skill run telemetry.
 *
 * This file is the sibling of connectors.ts. It holds the DB-side mirror of the
 * code-side SKILL_REGISTRY so admins can inspect versions, costs,
 * and prompt paths without reading source. Synced at deploy time by
 * scripts/sync-skills-catalog.ts.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import {
  retouchJobStatusEnum,
  skillKindEnum,
  skillLifecycleEnum,
} from './enums';

// ---------------------------------------------------------------------------
// skills_catalog
// ---------------------------------------------------------------------------

/**
 * Registry mirror of SKILL_REGISTRY in apps/web/lib/agents/registry.ts.
 * One row per vertical-agent or style skill. Upserted on every deploy by
 * scripts/sync-skills-catalog.ts so the admin skills page reflects the
 * deployed version without a separate API call into source.
 *
 * Lifecycle + active_version (JOV-3944) enable staged rollout and rollback
 * without deleting historical versions (see skills_catalog_versions).
 */
export const skillsCatalog = pgTable(
  'skills_catalog',
  {
    id: text('id').primaryKey(), // slug, e.g. 'retouch'
    name: text('name').notNull(),
    description: text('description'),
    kind: skillKindEnum('kind').notNull(),
    version: text('version').notNull(),
    /** Staged rollout state. Missing column at read time → treat as `ga`. */
    lifecycle: skillLifecycleEnum('lifecycle').notNull().default('ga'),
    /**
     * Version pointer served at invocation. Rollback flips this field;
     * historical rows live in skills_catalog_versions.
     */
    activeVersion: text('active_version').notNull(),
    entitlementRequired: text('entitlement_required'),
    model: text('model'),
    promptPath: text('prompt_path'), // relative to repo root
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    skillKindCheck: check(
      'skills_catalog_kind_check',
      drizzleSql`${table.kind} IN ('vertical_agent', 'style')`
    ),
    skillLifecycleIdx: index('skills_catalog_lifecycle_idx').on(
      table.lifecycle
    ),
  })
);

export type SkillsCatalogRow = typeof skillsCatalog.$inferSelect;
export type NewSkillsCatalogRow = typeof skillsCatalog.$inferInsert;

export const insertSkillsCatalogSchema = createInsertSchema(skillsCatalog);
export const selectSkillsCatalogSchema = createSelectSchema(skillsCatalog);

// ---------------------------------------------------------------------------
// skills_catalog_versions — immutable per-version snapshots (JOV-3944)
// ---------------------------------------------------------------------------

/**
 * One row per (skill_id, version). Recompiles and registry syncs insert new
 * rows; released versions are never mutated in place. `skills_catalog`
 * holds the head pointer (active_version + lifecycle).
 */
export const skillsCatalogVersions = pgTable(
  'skills_catalog_versions',
  {
    skillId: text('skill_id').notNull(),
    version: text('version').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    kind: skillKindEnum('kind').notNull(),
    lifecycle: skillLifecycleEnum('lifecycle').notNull().default('draft'),
    entitlementRequired: text('entitlement_required'),
    model: text('model'),
    promptPath: text('prompt_path'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    pk: primaryKey({
      name: 'skills_catalog_versions_pk',
      columns: [table.skillId, table.version],
    }),
    skillIdIdx: index('skills_catalog_versions_skill_id_idx').on(table.skillId),
  })
);

export type SkillsCatalogVersionRow = typeof skillsCatalogVersions.$inferSelect;
export type NewSkillsCatalogVersionRow =
  typeof skillsCatalogVersions.$inferInsert;

// ---------------------------------------------------------------------------
// skill_run_events — per-invocation telemetry (JOV-3946)
// ---------------------------------------------------------------------------

/**
 * Exactly one logical event row per skill invocation (idempotent on
 * `invocation_id`). Status progresses started → completed|error. Fail-open
 * writers must never break the skill run itself.
 */
export const skillRunEvents = pgTable(
  'skill_run_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Client/server-generated idempotency key for retries. */
    invocationId: text('invocation_id').notNull(),
    skillId: text('skill_id').notNull(),
    skillVersion: text('skill_version').notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull(), // started | completed | error
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    model: text('model'),
    /** Total tokens (prompt+completion) when known. */
    tokenCost: integer('token_cost'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }),
    /** Optional thumbs vote joined from feedback_items later. */
    feedbackVote: text('feedback_vote'),
    successMetricName: text('success_metric_name'),
    successMetricOutcome: jsonb('success_metric_outcome'),
    error: text('error'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    invocationUnique: uniqueIndex('skill_run_events_invocation_id_uidx').on(
      table.invocationId
    ),
    skillVersionIdx: index('skill_run_events_skill_version_idx').on(
      table.skillId,
      table.skillVersion,
      table.startedAt
    ),
    statusIdx: index('skill_run_events_status_idx').on(
      table.status,
      table.startedAt
    ),
  })
);

export type SkillRunEventRow = typeof skillRunEvents.$inferSelect;
export type NewSkillRunEventRow = typeof skillRunEvents.$inferInsert;

// ---------------------------------------------------------------------------
// tools_catalog
// ---------------------------------------------------------------------------

/**
 * Registry mirror for kind='tool' entries — same shape as skills_catalog
 * plus Zod schema paths so documentation generation can produce typed
 * input/output specs without running the tool. Empty in v1 (no tools yet).
 * Populated when the first tool skill ships.
 */
export const toolsCatalog = pgTable(
  'tools_catalog',
  {
    id: text('id').primaryKey(), // slug, e.g. 'fetch-spotify-stats'
    name: text('name').notNull(),
    description: text('description'),
    kind: skillKindEnum('kind').notNull().default('tool'),
    version: text('version').notNull(),
    entitlementRequired: text('entitlement_required'),
    model: text('model'),
    promptPath: text('prompt_path'),
    inputSchemaZodPath: text('input_schema_zod_path'), // path to Zod input schema
    outputSchemaZodPath: text('output_schema_zod_path'), // path to Zod output schema
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    toolKindCheck: check(
      'tools_catalog_kind_check',
      drizzleSql`${table.kind} = 'tool'`
    ),
  })
);

export type ToolsCatalogRow = typeof toolsCatalog.$inferSelect;
export type NewToolsCatalogRow = typeof toolsCatalog.$inferInsert;

export const insertToolsCatalogSchema = createInsertSchema(toolsCatalog);
export const selectToolsCatalogSchema = createSelectSchema(toolsCatalog);

// ---------------------------------------------------------------------------
// retouch_jobs
// ---------------------------------------------------------------------------

/**
 * One row per retouch invocation. Tracks the full lifecycle from queued
 * through Sharp pre-processing, Gemini image-edit call, ArcFace identity
 * check, post-processing, and user accept/discard. Preserves cost and token
 * usage for the admin cost dashboard and entitlement enforcement.
 * Indexed for per-user status queries (dashboard) and cron sweeper queries
 * (GC rejected results, sweep stale running jobs).
 */
export const retouchJobs = pgTable(
  'retouch_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Source and result asset R2 keys
    sourceAssetId: text('source_asset_id').notNull(),
    resultAssetId: text('result_asset_id'),

    // Style applied — 'white-space' is the only style in v1
    style: text('style').notNull().default('white-space'),
    // SHA-256 of the style markdown file at request time — correlates
    // output quality with prompt revisions post-hoc
    styleVersion: text('style_version').notNull(),

    // Optional free-text override appended to the style prompt for this image
    perImageOverride: text('per_image_override'),

    // Model identifier used for this job (e.g. 'google/gemini-2.5-flash-image')
    model: text('model').notNull(),

    status: retouchJobStatusEnum('status').notNull().default('queued'),

    // ArcFace cosine similarity vs. original (null until identity check runs).
    // The database check constraint enforces the valid cosine range.
    identityScore: numeric('identity_score', { precision: 4, scale: 3 }),

    // Raw token counts from the model response
    tokenUsage: jsonb('token_usage').default({}).notNull(),

    // Cost in USD for this job (updated after model response)
    cost: numeric('cost', { precision: 10, scale: 4 }).notNull().default('0'),

    // Machine-readable error for Sentry; never shown to users verbatim
    error: text('error'),

    // Chat thread that initiated this job (for routing the result card back)
    chatThreadId: text('chat_thread_id'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  t => [
    check(
      'retouch_jobs_identity_score_range_check',
      drizzleSql`${t.identityScore} IS NULL OR (${t.identityScore} >= -1 AND ${t.identityScore} <= 1)`
    ),
    check('retouch_jobs_cost_non_negative_check', drizzleSql`${t.cost} >= 0`),
    // Per-user status feed — used by dashboard and entitlement daily-budget check
    index('retouch_jobs_user_status_idx').on(t.userId, t.status, t.startedAt),
    // Cron sweeper index — GC rejected results, sweep stale running jobs
    index('retouch_jobs_status_started_idx').on(t.status, t.startedAt),
  ]
);

export type RetouchJob = typeof retouchJobs.$inferSelect;
export type NewRetouchJob = typeof retouchJobs.$inferInsert;

export const insertRetouchJobSchema = createInsertSchema(retouchJobs);
export const selectRetouchJobSchema = createSelectSchema(retouchJobs);
