import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { chatConversations } from './chat';

export const improvementItemStatusEnumValues = [
  'pending',
  'approved',
  'dismissed',
  'completed',
] as const;

export type ImprovementItemStatus =
  (typeof improvementItemStatusEnumValues)[number];

export const improvementItems = pgTable(
  'improvement_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id').references(() => chatConversations.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    analysisJson: jsonb('analysis_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text('status', { enum: improvementItemStatusEnumValues })
      .notNull()
      .default('pending'),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
    linearIssueId: text('linear_issue_id'),
  },
  table => ({
    statusCreatedAtIdx: index('idx_improvement_items_status_created_at').on(
      table.status,
      table.createdAt
    ),
  })
);

export const insertImprovementItemSchema = createInsertSchema(improvementItems);
export const selectImprovementItemSchema = createSelectSchema(improvementItems);

export type ImprovementItem = typeof improvementItems.$inferSelect;
export type NewImprovementItem = typeof improvementItems.$inferInsert;
