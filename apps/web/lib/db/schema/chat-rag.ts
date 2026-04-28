import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import { chatConversations, chatMessages } from './chat';

/**
 * Per-assistant-message retrieval + version trace.
 *
 * Stream-time identity is the server-generated `traceId`. The DB
 * `chat_messages.id` doesn't exist when the route emits the stream
 * (the client persists messages via a separate POST after streaming),
 * so `messageId` is nullable and populated later by the message-
 * persistence route via the `traceId` returned in stream metadata.
 *
 * `gitSha` from `VERCEL_GIT_COMMIT_SHA` lets eval/replay reverse-
 * lookup a `retrievalVersion` hash to a deploy commit.
 *
 * Trace writes are observability — never block the user response,
 * never throw from `onFinish` (caller wraps in try/catch).
 */
export const chatAnswerTraces = pgTable(
  'chat_answer_traces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stream-time identity. Returned in stream metadata so UI can use it for feedback. */
    traceId: uuid('trace_id').notNull().unique(),
    /**
     * Assistant message id. NULLABLE because at `onFinish` time the assistant
     * message hasn't been persisted yet — the client posts it via
     * `/api/chat/conversations/:id/messages` afterward, including the
     * `traceId` so this column gets populated.
     */
    messageId: uuid('message_id').references(() => chatMessages.id, {
      onDelete: 'cascade',
    }),
    /** The user message that triggered the turn. Same nullability story as messageId. */
    userMessageId: uuid('user_message_id').references(() => chatMessages.id, {
      onDelete: 'cascade',
    }),
    /** Stable from request time. Useful for grouping traces in the same conversation. */
    conversationId: uuid('conversation_id').references(
      () => chatConversations.id,
      { onDelete: 'cascade' }
    ),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** File paths under apps/web/lib/chat/knowledge/canon/ that were retrieved. */
    retrievedCanonPaths: text('retrieved_canon_paths').array().notNull(),
    /** Cosine scores aligned with retrievedCanonPaths. */
    retrievedScores: numeric('retrieved_scores').array().notNull(),
    /** Names of artist-data lookup tools the model invoked this turn (sorted). */
    artistToolsCalled: text('artist_tools_called').array().notNull(),

    /**
     * Composite hash of (systemPrompt + retrievalConfig + modelId +
     * embeddingModel + canonFileShas + toolSchemas), 12 chars. Stamps
     * the version of the entire chat-turn inputs for regression triage.
     */
    retrievalVersion: text('retrieval_version').notNull(),
    /** `VERCEL_GIT_COMMIT_SHA` at request time. Reverse-lookup for hash → deploy. */
    gitSha: text('git_sha'),
    /** Selected model id (e.g. `anthropic/claude-sonnet-4-...`). */
    modelId: text('model_id').notNull(),
    /** Embedding model id used for canon retrieval. */
    embeddingModel: text('embedding_model'),

    retrievalLatencyMs: integer('retrieval_latency_ms'),
    totalLatencyMs: integer('total_latency_ms'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    messageIdIdx: index('idx_chat_answer_traces_message_id').on(
      table.messageId
    ),
    conversationCreatedIdx: index(
      'idx_chat_answer_traces_conversation_created'
    ).on(table.conversationId, table.createdAt),
    traceIdIdx: index('idx_chat_answer_traces_trace_id').on(table.traceId),
  })
);

export type ChatAnswerTrace = typeof chatAnswerTraces.$inferSelect;
export type NewChatAnswerTrace = typeof chatAnswerTraces.$inferInsert;

export const insertChatAnswerTraceSchema = createInsertSchema(chatAnswerTraces);
export const selectChatAnswerTraceSchema = createSelectSchema(chatAnswerTraces);
