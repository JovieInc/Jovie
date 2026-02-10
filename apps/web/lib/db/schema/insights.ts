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
  insightCategoryEnum,
  insightPriorityEnum,
  insightRunStatusEnum,
  insightStatusEnum,
  insightTypeEnum,
} from './enums';
import { creatorProfiles } from './profiles';

// -------------------------------------------------------------------
// Insight Generation Runs — tracks each AI generation invocation
// -------------------------------------------------------------------
export const insightGenerationRuns = pgTable(
  'insight_generation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

    // Run metadata
    status: insightRunStatusEnum('status').notNull().default('pending'),
    insightsGenerated: integer('insights_generated').notNull().default(0),
    dataPointsAnalyzed: integer('data_points_analyzed').notNull().default(0),

    // AI usage tracking
    modelUsed: text('model_used'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    durationMs: integer('duration_ms'),

    // Error handling
    error: text('error'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('idx_insight_runs_creator').on(
      table.creatorProfileId,
      table.createdAt
    ),
    index('idx_insight_runs_status').on(table.status),
  ]
);

// -------------------------------------------------------------------
// AI Insights — individual insights generated for creators
// -------------------------------------------------------------------
export const aiInsights = pgTable(
  'ai_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

    // Classification
    insightType: insightTypeEnum('insight_type').notNull(),
    category: insightCategoryEnum('category').notNull(),
    priority: insightPriorityEnum('priority').notNull().default('medium'),

    // Content (AI-generated)
    title: text('title').notNull(),
    description: text('description').notNull(),
    actionSuggestion: text('action_suggestion'),

    // Data backing
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    dataSnapshot: jsonb('data_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    // Time context
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    comparisonPeriodStart: timestamp('comparison_period_start', {
      withTimezone: true,
    }),
    comparisonPeriodEnd: timestamp('comparison_period_end', {
      withTimezone: true,
    }),

    // Lifecycle
    status: insightStatusEnum('status').notNull().default('active'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Metadata
    generationRunId: uuid('generation_run_id').references(
      () => insightGenerationRuns.id,
      { onDelete: 'set null' }
    ),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    // Primary lookup: active insights for a creator, newest first
    index('idx_ai_insights_creator_active').on(
      table.creatorProfileId,
      table.status,
      table.createdAt
    ),
    // Expiration cleanup
    index('idx_ai_insights_expires_at').on(table.expiresAt),
    // Priority sorting
    index('idx_ai_insights_creator_priority').on(
      table.creatorProfileId,
      table.priority,
      table.createdAt
    ),
    // Dedup: prevent duplicate insight types in same period
    uniqueIndex('idx_ai_insights_dedup').on(
      table.creatorProfileId,
      table.insightType,
      table.periodStart,
      table.periodEnd
    ),
  ]
);

// -------------------------------------------------------------------
// Zod schemas for validation
// -------------------------------------------------------------------
export const insertAiInsightSchema = createInsertSchema(aiInsights);
export const selectAiInsightSchema = createSelectSchema(aiInsights);

export const insertInsightGenerationRunSchema = createInsertSchema(
  insightGenerationRuns
);
export const selectInsightGenerationRunSchema = createSelectSchema(
  insightGenerationRuns
);
