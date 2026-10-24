import { sql as drizzleSql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import { chatConversations, chatTurns } from './chat';

export const feedbackStatusEnumValues = ['pending', 'dismissed'] as const;

/**
 * Closed-loop classification (JOV-6433). Computed at capture time by the
 * deterministic classifier in `lib/feedback-classification.ts` — never by
 * the reporter. `bug_verifiable` rows enter the dedupe → auto-remediation
 * path; `feature_or_change` rows emit a Summer signal for now/later/never
 * ranking; `noise` rows are recorded and auto-disposed `never`.
 */
export const feedbackClassificationEnumValues = [
  'bug_verifiable',
  'feature_or_change',
  'noise',
] as const;

export type FeedbackClassification =
  (typeof feedbackClassificationEnumValues)[number];

/**
 * Durable outcome for a feedback item (JOV-6433). Distinct from `status`
 * (admin triage): `status` says whether a human dismissed the row;
 * `disposition` is the closed-loop decision and is only written together
 * with a `feedback_decisions` ledger entry.
 */
export const feedbackDispositionEnumValues = [
  'pending',
  'auto_remediation',
  'duplicate',
  'pending_summer',
  'cert_required',
  'now',
  'later',
  'never',
] as const;

export type FeedbackDisposition =
  (typeof feedbackDispositionEnumValues)[number];

/** Decision kinds recorded in the `feedback_decisions` ledger. */
export const feedbackDecisionEnumValues = [
  'classified',
  'auto_ship_bug',
  'duplicate_of',
  'duplicate_observed',
  'summer_signal',
  'taste_cert_required',
  'now',
  'later',
  'never',
  'noise',
] as const;

export type FeedbackDecisionKind = (typeof feedbackDecisionEnumValues)[number];

/**
 * Vote values for in-chat 👍/👎 feedback rows (JOV #11460).
 * Rows without a vote are classic free-text feedback submissions.
 */
export const feedbackVoteEnumValues = ['up', 'down'] as const;

export type FeedbackVote = (typeof feedbackVoteEnumValues)[number];

/**
 * Unified in-app feedback store.
 *
 * Two row shapes share this table (extended per JOV #11460 — do NOT create
 * a parallel table):
 *
 * 1. Classic free-text feedback (`message_id IS NULL`): dashboard/chat
 *    feedback form submissions. `message` holds the user's text.
 * 2. Chat thumbs votes (`message_id IS NOT NULL`): one row per
 *    (user, chat message, tool call) with `vote` set to 'up'/'down'.
 *    Votes are idempotent — re-voting updates the row in place
 *    (see `feedback_items_vote_unique`), and undoing a vote deletes it.
 *
 * Vote rows are Eve-readable via plain SQL, e.g.:
 *
 *   SELECT model_used, vote, COUNT(*)
 *   FROM feedback_items
 *   WHERE vote IS NOT NULL
 *   GROUP BY 1, 2;
 *
 * `model_used` is required for the model A/B bake-off loop — it is resolved
 * server-side from `chat_turns.model` whenever a turn id is provided.
 */
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
    /** Chat message id the vote refers to (client/timeline message id). */
    messageId: text('message_id'),
    /** Conversation containing the voted message. */
    conversationId: uuid('conversation_id').references(
      () => chatConversations.id,
      { onDelete: 'set null' }
    ),
    /** Persisted chat turn — server-truth join key for model attribution. */
    turnId: uuid('turn_id').references(() => chatTurns.id, {
      onDelete: 'set null',
    }),
    /**
     * Tool call the vote targets. Empty string = message-level vote.
     * NOT NULL so the idempotency unique index binds without NULL escape
     * hatches (Postgres treats NULLs as distinct in unique indexes).
     */
    toolCallId: text('tool_call_id').notNull().default(''),
    /** Tool/skill name that produced the voted output (tool votes only). */
    toolName: text('tool_name'),
    /** Model id that produced the voted output. Required for A/B bake-offs. */
    modelUsed: text('model_used'),
    /** The voter's plan at vote time (free/pro/...). */
    plan: text('plan'),
    /** 👍 = 'up', 👎 = 'down'. Null on classic feedback rows. */
    vote: text('vote', { enum: feedbackVoteEnumValues }),
    /** Closed-loop classification (JOV-6433). Null on rows predating it. */
    classification: text('classification', {
      enum: feedbackClassificationEnumValues,
    }),
    /** Closed-loop outcome (JOV-6433); see `feedback_decisions` ledger. */
    disposition: text('disposition', { enum: feedbackDispositionEnumValues })
      .notNull()
      .default('pending'),
    /**
     * Canonical dedupe key (JOV-6433): normalized-message hash. Identical
     * reports share it; semantic similarity does not merge rows.
     */
    fingerprint: text('fingerprint'),
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
    /**
     * Idempotent votes: one row per (user, message, tool call). Partial on
     * message_id so classic free-text feedback rows are unaffected.
     */
    voteUniqueIdx: uniqueIndex('feedback_items_vote_unique')
      .on(table.userId, table.messageId, table.toolCallId)
      .where(drizzleSql`${table.messageId} IS NOT NULL`),
    /** Eve's bake-off query path: votes grouped by model. */
    voteModelIdx: index('feedback_items_vote_model_idx')
      .on(table.modelUsed, table.vote)
      .where(drizzleSql`${table.vote} IS NOT NULL`),
    /** Closed-loop queries: pending dispositions per class. */
    dispositionIdx: index('feedback_items_disposition_idx').on(
      table.disposition,
      table.createdAt
    ),
    fingerprintIdx: index('feedback_items_fingerprint_idx')
      .on(table.fingerprint)
      .where(drizzleSql`${table.fingerprint} IS NOT NULL`),
    conversationIdx: index('feedback_items_conversation_idx')
      .on(table.conversationId)
      .where(drizzleSql`${table.conversationId} IS NOT NULL`),
  })
);

export const insertFeedbackItemSchema = createInsertSchema(feedbackItems);
export const selectFeedbackItemSchema = createSelectSchema(feedbackItems);

export type FeedbackItem = typeof feedbackItems.$inferSelect;
export type NewFeedbackItem = typeof feedbackItems.$inferInsert;

/**
 * Durable decision ledger (JOV-6433): one append-only row per decision so we
 * never re-decide without prior context. Every `feedback_items.disposition`
 * transition is written here first — actor + reason + timestamp are required
 * for now/later/never. Queryable per item, per kind, or for open
 * `summer_signal`/`auto_ship_bug` work.
 */
export const feedbackDecisions = pgTable(
  'feedback_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    feedbackItemId: uuid('feedback_item_id')
      .notNull()
      .references(() => feedbackItems.id, { onDelete: 'cascade' }),
    decision: text('decision', { enum: feedbackDecisionEnumValues }).notNull(),
    reason: text('reason').notNull().default(''),
    /** Who decided: 'system:classifier', 'summer', admin user id, 'founder'. */
    actor: text('actor').notNull(),
    /**
     * Event payload: classification signals, dedupe target, or the Summer
     * decision packet (reproducibility, severity, exposure, effort,
     * confidence — measured facts kept distinct from ROI hypotheses).
     */
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    itemCreatedIdx: index('feedback_decisions_item_created_idx').on(
      table.feedbackItemId,
      table.createdAt
    ),
    decisionIdx: index('feedback_decisions_decision_idx').on(
      table.decision,
      table.createdAt
    ),
  })
);

export type FeedbackDecisionRow = typeof feedbackDecisions.$inferSelect;
export type NewFeedbackDecisionRow = typeof feedbackDecisions.$inferInsert;
