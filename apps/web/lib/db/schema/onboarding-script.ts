import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

/**
 * Deterministic onboarding script lines (JOV-3806).
 *
 * The response bank behind the LLM-failure fallback in
 * `lib/chat/onboarding-script/`. Seed lines live in code (`script.ts`) and
 * are mirrored here so the nightly self-improvement job
 * (`lib/onboarding/script-aggregation.ts`) can attach conversion counters;
 * promoted rows (`source='promoted'`) exist only in this table — they are
 * lint-gated LLM responses that out-converted the seeds.
 *
 * Counters are recomputed from scratch nightly over a 90-day window
 * (idempotent, no watermark) — onboarding volume keeps that cheap.
 */
export const onboardingScriptLines = pgTable(
  'onboarding_script_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `${stepId}:${variant}` — matches chat_messages.script_line_key. */
    lineKey: text('line_key').notNull(),
    stepId: text('step_id').notNull(),
    variant: text('variant').notNull(),
    text: text('text').notNull(),
    /** 'seed' (mirrored from code) | 'promoted' (mined LLM response). */
    source: text('source').notNull().default('seed'),
    /** 'active' (servable) | 'candidate' (observed, not served) | 'retired'. */
    status: text('status').notNull().default('active'),
    /** Serving weight for weighted-random pick among active lines. */
    weight: integer('weight').notNull().default(100),
    /** Distinct conversations that saw this line (90-day window). */
    impressions: integer('impressions').notNull().default(0),
    /** Of those, conversations that completed onboarding. */
    conversions: integer('conversions').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    lineKeyUnique: uniqueIndex('idx_onboarding_script_lines_line_key').on(
      table.lineKey
    ),
    stepStatusIdx: index('idx_onboarding_script_lines_step_status').on(
      table.stepId,
      table.status
    ),
  })
);

export const insertOnboardingScriptLineSchema = createInsertSchema(
  onboardingScriptLines
);
export const selectOnboardingScriptLineSchema = createSelectSchema(
  onboardingScriptLines
);
export type OnboardingScriptLine = typeof onboardingScriptLines.$inferSelect;
export type NewOnboardingScriptLine = typeof onboardingScriptLines.$inferInsert;
