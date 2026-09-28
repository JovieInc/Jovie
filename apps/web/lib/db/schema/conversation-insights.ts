import {
  boolean,
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
import { chatConversations } from './chat';
import { conversationFunnelStageEnum, objectionStatusEnum } from './enums';

/**
 * Conversation signal rows (JOV-6784): one row per sampled product-chat
 * conversation. Stores aggregates and redacted quotes only — never PII and
 * never LYB health data.
 */
export const conversationSignals = pgTable(
  'conversation_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Unique so pipeline re-runs stay idempotent. */
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    /** UTC Monday of the ISO week the conversation was classified in. */
    weekStart: timestamp('week_start', { withTimezone: true }).notNull(),
    stage: conversationFunnelStageEnum('stage').notNull(),
    intent: text('intent').notNull(),
    objectionKey: text('objection_key'),
    confusionOrBug: boolean('confusion_or_bug').notNull().default(false),
    featureAsk: text('feature_ask'),
    dropOffPoint: text('drop_off_point'),
    /** Redacted supporting quote. Never raw PII. */
    redactedQuote: text('redacted_quote'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    conversationUnique: uniqueIndex(
      'idx_conversation_signals_conversation_unique'
    ).on(table.conversationId),
    weekStageIdx: index('idx_conversation_signals_week_stage').on(
      table.weekStart,
      table.stage
    ),
    objectionIdx: index('idx_conversation_signals_objection').on(
      table.objectionKey
    ),
  })
);

/**
 * Objections table in Ovie (JOV-6784): detected objections aggregated across
 * sources. System-drafted answers are approved via Inbox cards and published
 * into the content pipeline; `resolutionRef`/`resolvedAt` close the loop.
 */
export const conversationObjections = pgTable(
  'conversation_objections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable dedupe key derived from the classified objection type. */
    objectionKey: text('objection_key').notNull(),
    objection: text('objection').notNull(),
    frequency: integer('frequency').notNull().default(1),
    stage: conversationFunnelStageEnum('stage').notNull(),
    source: text('source').notNull().default('chat'),
    draftedAnswer: text('drafted_answer'),
    status: objectionStatusEnum('status').notNull().default('draft'),
    /** Pre-redacted `{ conversationId, quote }` evidence links; bounded. */
    evidence: jsonb('evidence')
      .$type<{ conversationId: string; quote?: string }[]>()
      .notNull()
      .default([]),
    /** Shipped fix or published answer reference (PR, blog slug, Linear id). */
    resolutionRef: text('resolution_ref'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => ({
    objectionKeyUnique: uniqueIndex(
      'idx_conversation_objections_key_unique'
    ).on(table.objectionKey),
    statusIdx: index('idx_conversation_objections_status').on(table.status),
    stageIdx: index('idx_conversation_objections_stage').on(table.stage),
  })
);

// Schema validations
export const insertConversationSignalSchema =
  createInsertSchema(conversationSignals);
export const selectConversationSignalSchema =
  createSelectSchema(conversationSignals);

export const insertConversationObjectionSchema = createInsertSchema(
  conversationObjections
);
export const selectConversationObjectionSchema = createSelectSchema(
  conversationObjections
);

// Types
export type ConversationSignal = typeof conversationSignals.$inferSelect;
export type NewConversationSignal = typeof conversationSignals.$inferInsert;

export type ConversationObjection = typeof conversationObjections.$inferSelect;
export type NewConversationObjection =
  typeof conversationObjections.$inferInsert;
