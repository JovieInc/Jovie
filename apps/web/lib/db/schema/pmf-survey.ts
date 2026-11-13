import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Sean Ellis product-market-fit survey state, one row per user.
 *
 * The row records both the answer and the prompt history the eligibility
 * rule needs: how often the prompt was dismissed and when. Rules live in
 * `lib/pmf/eligibility.ts`; writes in `lib/pmf/store.server.ts`. Answers are
 * internal measurement only and are never sent anywhere.
 */
export const PMF_SURVEY_RESPONSES = [
  'very_disappointed',
  'somewhat_disappointed',
  'not_disappointed',
] as const;
export type PmfSurveyResponse = (typeof PMF_SURVEY_RESPONSES)[number];

export const pmfSurveyResponses = pgTable(
  'pmf_survey_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null until the user answers. Text + CHECK, not a pg enum. */
    response: text('response'),
    /** Optional free text: the main benefit the user gets. */
    mainBenefit: text('main_benefit'),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    /** Times the prompt was dismissed without an answer. */
    dismissCount: integer('dismiss_count').notNull().default(0),
    lastDismissedAt: timestamp('last_dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    check(
      'pmf_survey_responses_response_check',
      drizzleSql`${table.response} IS NULL OR ${table.response} IN ('very_disappointed', 'somewhat_disappointed', 'not_disappointed')`
    ),
  ]
);

export type PmfSurveyResponseRow = typeof pmfSurveyResponses.$inferSelect;
