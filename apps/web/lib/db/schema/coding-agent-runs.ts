/**
 * Coding Agent Run Ingestion (JOV-6508)
 *
 * Receipts for EXTERNAL coding-agent runs (Hyperagent threads, Devin
 * sessions, Cursor, GrokBot) — deliberately separate from `agent_runs`,
 * which audits in-product agents with different semantics (user-scoped,
 * route names, estimated cost, no outcome labels).
 *
 * Design invariants:
 * - `modelName` is the EXACT provider-reported model string (e.g.
 *   `glm-5.3-flash`), never a route name like `openrouter-free`.
 * - `costUsd` + `costSource` distinguish billed actuals from backfill
 *   estimates. Never present estimates as actuals.
 * - `promptDigest` is a SHA-256 of the task prompt — never prompt text.
 * - `outcomeLabel` stays `open` until the 7-day post-merge window closes.
 *   The labeler (scripts/agents/label-outcomes.ts) owns transitions.
 *
 * Jev consumes this table via `costPerLandedPr` (see
 * apps/web/lib/coding-agent-runs/cost-per-landed-pr.ts) — schema changes
 * here must keep that query surface stable.
 */

import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  codingAgentCostSourceEnum,
  codingAgentOutcomeEnum,
  codingAgentSourceEnum,
} from './enums';

export const codingAgentRuns = pgTable(
  'coding_agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Provider that produced the run. */
    source: codingAgentSourceEnum('source').notNull(),

    /** Provider's session/thread id; unique per source (idempotent upsert key). */
    sourceRunId: text('source_run_id').notNull(),

    /** Internal link to the Hyperagent thread / Devin session. Never public-facing. */
    sessionUrl: text('session_url'),

    /** Provider-side agent identity (e.g. Hyperagent namedAgentId + display name). */
    agentId: text('agent_id'),
    agentName: text('agent_name'),

    /** Exact model string the provider reports — never a route name. */
    modelName: text('model_name'),

    /** USD cost; `costSource` says whether this is billed truth or an estimate. */
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }),
    costSource: codingAgentCostSourceEnum('cost_source').notNull(),

    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedTokens: integer('cached_tokens'),

    /** Map of tool_name → call count. Payloads are never stored. */
    toolsUsed: jsonb('tools_used').notNull().default({}),

    /** SHA-256 hex of the task prompt. NEVER the prompt text. */
    promptDigest: text('prompt_digest'),

    /** {files: string[], fileCount, additions, deletions} from the linked PR. */
    diffStats: jsonb('diff_stats'),

    prUrl: text('pr_url'),
    prNumber: integer('pr_number'),

    /** [{name, status, conclusion, runId}] check runs for the PR head commit. */
    ciResult: jsonb('ci_result'),

    mergeTimestamp: timestamp('merge_timestamp', { withTimezone: true }),

    outcomeLabel: codingAgentOutcomeEnum('outcome_label')
      .notNull()
      .default('open'),

    /** Revert PR/commit URL when outcomeLabel = 'reverted'. */
    revertLink: text('revert_link'),

    /** Sentry issue ids touching the diff's files within 7d of merge. */
    postLandIncidents: text('post_land_incidents')
      .array()
      .notNull()
      .default([]),

    linearIssueId: text('linear_issue_id'),

    /** Free-form provenance notes (e.g. cost estimation method). */
    notes: text('notes'),

    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    ingestedAt: timestamp('ingested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('coding_agent_runs_source_run_idx').on(t.source, t.sourceRunId),
    index('coding_agent_runs_outcome_merge_idx').on(
      t.outcomeLabel,
      t.mergeTimestamp
    ),
    index('coding_agent_runs_model_idx').on(t.source, t.modelName),
  ]
);

export type CodingAgentRun = typeof codingAgentRuns.$inferSelect;
export type NewCodingAgentRun = typeof codingAgentRuns.$inferInsert;
export const insertCodingAgentRunSchema = createInsertSchema(codingAgentRuns);
export const selectCodingAgentRunSchema = createSelectSchema(codingAgentRuns);
