import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

/**
 * Per-workflow model A/B bake-off + cost-aware auto-promotion (GH #11462).
 *
 * One row per workflow (e.g. 'chat'). Follows the feature-flag-override
 * pattern: absent row = no experiment, code default model is used. A row
 * with status 'active' splits traffic across `candidates`; 'promoted'
 * pins `promotedModel` as the always-on winner.
 */

export const modelExperimentStatusEnumValues = [
  /** Traffic is being split across candidates; votes/cost accumulating. */
  'active',
  /** A winner was promoted (auto or manual); promotedModel is served. */
  'promoted',
  /** Challenger won on quality but is materially more expensive — needs Tim. */
  'needs_decision',
  /** Experiment paused: control model served, no traffic split. */
  'paused',
  /** Promotion manually rolled back: control model served. */
  'rolled_back',
] as const;

export type ModelExperimentStatus =
  (typeof modelExperimentStatusEnumValues)[number];

/** One traffic arm: gateway model id + relative weight (e.g. 80/20). */
export interface ModelExperimentCandidate {
  readonly model: string;
  readonly weight: number;
}

export const modelExperiments = pgTable(
  'model_experiments',
  {
    /** Workflow key, e.g. 'chat', 'album-art', 'retouch'. */
    workflow: text('workflow').primaryKey(),
    status: text('status', { enum: modelExperimentStatusEnumValues })
      .notNull()
      .default('active'),
    /**
     * Ordered traffic arms. Index 0 is the control (current default) model
     * per contract — promotion compares challengers against it.
     */
    candidates: jsonb('candidates')
      .$type<ModelExperimentCandidate[]>()
      .notNull(),
    /** Winner pinned by auto-promotion or manual action. */
    promotedModel: text('promoted_model'),
    /**
     * feedback_items.tool_name that attributes votes to this workflow.
     * Null = message-level chat votes (tool_call_id = '').
     */
    feedbackToolName: text('feedback_tool_name'),
    /** Minimum votes per arm before a promotion decision is made. */
    minVotesPerArm: integer('min_votes_per_arm').notNull().default(30),
    /**
     * Cost tolerance for auto-promotion: challenger avg cost must be
     * <= control avg cost * (1 + costTolerance). 0.05 = 5% headroom.
     */
    costTolerance: doublePrecision('cost_tolerance').notNull().default(0.05),
    /** Clerk user id of the admin who created/last edited the experiment. */
    updatedBy: text('updated_by'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    statusIdx: index('model_experiments_status_idx').on(table.status),
  })
);

/**
 * Per-request token/cost log for experiment arms. Written only while an
 * experiment is active for the workflow (no steady-state write cost).
 */
export const modelUsageEvents = pgTable(
  'model_usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflow: text('workflow').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    /** Estimated USD from the static price map; null when model unpriced. */
    costUsd: doublePrecision('cost_usd'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    workflowModelIdx: index('model_usage_events_workflow_model_idx').on(
      table.workflow,
      table.model,
      table.createdAt
    ),
  })
);

/** Append-only audit log of every promotion / escalation / rollback. */
export const modelPromotions = pgTable(
  'model_promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflow: text('workflow').notNull(),
    fromModel: text('from_model').notNull(),
    toModel: text('to_model'),
    /** 'auto_promote' | 'needs_decision' | 'manual_promote' | 'rollback' */
    action: text('action').notNull(),
    /** Decision evidence: per-arm votes, up-rates, costs, p-value. */
    evidence: jsonb('evidence')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** 'cron' or an admin Clerk user id. */
    actor: text('actor').notNull().default('cron'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    workflowIdx: index('model_promotions_workflow_idx').on(
      table.workflow,
      table.createdAt
    ),
    recentIdx: index('model_promotions_created_idx').on(table.createdAt),
  })
);

export const insertModelExperimentSchema = createInsertSchema(modelExperiments);
export const selectModelExperimentSchema = createSelectSchema(modelExperiments);

export type ModelExperiment = typeof modelExperiments.$inferSelect;
export type NewModelExperiment = typeof modelExperiments.$inferInsert;
export type ModelUsageEvent = typeof modelUsageEvents.$inferSelect;
export type NewModelUsageEvent = typeof modelUsageEvents.$inferInsert;
export type ModelPromotion = typeof modelPromotions.$inferSelect;
export type NewModelPromotion = typeof modelPromotions.$inferInsert;
