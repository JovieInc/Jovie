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

export const userInterviewStatusEnumValues = [
  'pending',
  'summarizing',
  'summarized',
  'failed',
  'dismissed',
] as const;

export type UserInterviewStatus =
  (typeof userInterviewStatusEnumValues)[number];

export interface InterviewTranscriptEntry {
  questionId: string;
  prompt: string;
  answer: string | null;
  skipped: boolean;
  timestamp: string;
}

export interface InterviewSummaryStructured {
  one_line_summary: string;
  top_pain_points: string[];
  current_alternatives: string[];
  quotable_line: string;
}

export interface InterviewMetadata {
  persona?: string | null;
  plan?: string | null;
  locale?: string | null;
  userAgent?: string | null;
  waitlistEntryId?: string | null;
  accessOutcome?: string | null;
  submittedFrom?: 'onboarding_chat' | string | null;
  summary_structured?: InterviewSummaryStructured | null;
  summary_error?: string | null;
}

export const userInterviews = pgTable(
  'user_interviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('onboarding'),
    transcript: jsonb('transcript')
      .$type<InterviewTranscriptEntry[]>()
      .notNull()
      .default([]),
    summary: text('summary'),
    status: text('status', { enum: userInterviewStatusEnumValues })
      .notNull()
      .default('pending'),
    summaryAttempts: integer('summary_attempts').notNull().default(0),
    metadata: jsonb('metadata')
      .$type<InterviewMetadata>()
      .notNull()
      .default({}),
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userSourceUnique: uniqueIndex('user_interviews_user_source_unique').on(
      table.userId,
      table.source
    ),
    statusIdx: index('user_interviews_status_idx').on(
      table.status,
      table.createdAt
    ),
  })
);

export const insertUserInterviewSchema = createInsertSchema(userInterviews);
export const selectUserInterviewSchema = createSelectSchema(userInterviews);

export type UserInterview = typeof userInterviews.$inferSelect;
export type NewUserInterview = typeof userInterviews.$inferInsert;
