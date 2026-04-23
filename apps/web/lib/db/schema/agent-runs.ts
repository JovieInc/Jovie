import { sql as drizzleSql } from 'drizzle-orm';
import {
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
import { users } from './auth';
import { discogReleases } from './content';
import { creatorProfiles } from './profiles';

// Append-only audit log of every agent run. One row per parent run;
// per-tool step detail lives in agentRunSteps.
export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => creatorProfiles.id, {
      onDelete: 'set null',
    }),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'set null',
    }),
    parentRunId: uuid('parent_run_id'),
    agentType: text('agent_type').notNull(),
    // 'queued' | 'running' | 'completed' | 'failed' | 'blocked_budget' | 'partial'
    status: text('status').notNull().default('queued'),
    schemaVersion: text('schema_version').notNull().default('v1'),
    triggerRunId: text('trigger_run_id'),
    idempotencyKey: text('idempotency_key'),
    input: jsonb('input').$type<Record<string, unknown>>().default({}),
    output: jsonb('output').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    attemptCount: integer('attempt_count').notNull().default(0),
    budgetReservedCents: integer('budget_reserved_cents').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    model: text('model'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userStartedIdx: index('idx_agent_runs_user_started').on(
      table.userId,
      table.startedAt
    ),
    parentIdx: index('idx_agent_runs_parent').on(table.parentRunId),
    activeStatusIdx: index('idx_agent_runs_active_status').on(table.status),
    releaseIdx: index('idx_agent_runs_release').on(table.releaseId),
    idempotencyIdx: uniqueIndex('idx_agent_runs_idempotency')
      .on(table.idempotencyKey)
      .where(drizzleSql`idempotency_key IS NOT NULL`),
  })
);

// Per-tool-call detail. Each row is one step.run inside a parent agent run.
export const agentRunSteps = pgTable(
  'agent_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    toolSlug: text('tool_slug').notNull(),
    toolVersion: text('tool_version').notNull(),
    // 'queued' | 'running' | 'completed' | 'failed' | 'skipped'
    status: text('status').notNull().default('queued'),
    input: jsonb('input').$type<Record<string, unknown>>().default({}),
    output: jsonb('output').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    attemptCount: integer('attempt_count').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    model: text('model'),
    tokenIn: integer('token_in'),
    tokenOut: integer('token_out'),
    imageCount: integer('image_count'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    runIdx: index('idx_agent_run_steps_run').on(table.runId),
    toolIdx: index('idx_agent_run_steps_tool').on(table.toolSlug),
  })
);

// Money-of-record for budget enforcement. One row per (user, YYYY-MM).
// Enforcement uses atomic UPDATE ... WHERE reserved + spent + est <= cap RETURNING.
export const userMonthlyUsage = pgTable(
  'user_monthly_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Format: 'YYYY-MM' (e.g. '2026-04'). Also used for trial-lifetime under '0000-00'.
    yearMonth: text('year_month').notNull(),
    reservedCents: integer('reserved_cents').notNull().default(0),
    spentCents: integer('spent_cents').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    pk: uniqueIndex('idx_user_monthly_usage_pk').on(
      table.userId,
      table.yearMonth
    ),
  })
);

// Additive credit grants: admin gifts, paid top-ups, referral bonuses.
// Budget check: planBudget + sum(activeGrants) - monthlySpend.
export const userCreditGrants = pgTable(
  'user_credit_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cents: integer('cents').notNull(),
    // 'admin_gift' | 'stripe_topup' | 'referral' | 'support_comp' | 'beta_credit'
    reason: text('reason').notNull(),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    consumedCents: integer('consumed_cents').notNull().default(0),
    expiresAt: timestamp('expires_at'),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('idx_user_credit_grants_user').on(table.userId),
    activeIdx: index('idx_user_credit_grants_active').on(
      table.userId,
      table.expiresAt
    ),
  })
);

// Schema validations
export const insertAgentRunSchema = createInsertSchema(agentRuns);
export const selectAgentRunSchema = createSelectSchema(agentRuns);
export const insertAgentRunStepSchema = createInsertSchema(agentRunSteps);
export const selectAgentRunStepSchema = createSelectSchema(agentRunSteps);
export const insertUserMonthlyUsageSchema =
  createInsertSchema(userMonthlyUsage);
export const selectUserMonthlyUsageSchema =
  createSelectSchema(userMonthlyUsage);
export const insertUserCreditGrantSchema = createInsertSchema(userCreditGrants);
export const selectUserCreditGrantSchema = createSelectSchema(userCreditGrants);

// Types
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunStep = typeof agentRunSteps.$inferSelect;
export type NewAgentRunStep = typeof agentRunSteps.$inferInsert;
export type UserMonthlyUsage = typeof userMonthlyUsage.$inferSelect;
export type NewUserMonthlyUsage = typeof userMonthlyUsage.$inferInsert;
export type UserCreditGrant = typeof userCreditGrants.$inferSelect;
export type NewUserCreditGrant = typeof userCreditGrants.$inferInsert;

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked_budget'
  | 'partial';

export type AgentRunStepStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';
