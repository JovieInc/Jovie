import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';

export const feedbackStatusEnumValues = ['pending', 'dismissed'] as const;

export const feedbackItems = pgTable(
  'feedback_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    message: text('message').notNull(),
    source: text('source').notNull().default('dashboard'),
    status: text('status', { enum: feedbackStatusEnumValues })
      .notNull()
      .default('pending'),
    context: jsonb('context')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dismissedAt: timestamp('dismissed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    statusCreatedIdx: index('feedback_items_status_created_idx').on(
      table.status,
      table.createdAt
    ),
    userIdx: index('feedback_items_user_idx').on(table.userId),
  })
);

export const insertFeedbackItemSchema = createInsertSchema(feedbackItems);
export const selectFeedbackItemSchema = createSelectSchema(feedbackItems);

export type FeedbackItem = typeof feedbackItems.$inferSelect;
export type NewFeedbackItem = typeof feedbackItems.$inferInsert;
