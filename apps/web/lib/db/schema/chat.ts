import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
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
import { chatMessageRoleEnum } from './enums';
import { creatorProfiles } from './profiles';

/**
 * Chat conversations table.
 * Stores conversation metadata for persistent chat history.
 *
 * userId/creatorProfileId are nullable to support pre-account onboarding
 * conversations (JOV-2132). Anonymous rows are identified by sessionId
 * and later claimed onto a real user via /api/onboarding/claim. The
 * check constraint enforces that every row has at least one identifier.
 */
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'cascade' }
    ),
    /** Anonymous onboarding session identifier (UUID v7, signed cookie value) */
    sessionId: text('session_id'),
    title: text('title'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('idx_chat_conversations_user_id').on(table.userId),
    creatorProfileIdIdx: index('idx_chat_conversations_creator_profile_id').on(
      table.creatorProfileId
    ),
    updatedAtIdx: index('idx_chat_conversations_updated_at').on(
      table.updatedAt
    ),
    /** Anonymous lookup index: filter by sessionId AND userId IS NULL */
    sessionIdIdx: index('idx_chat_conversations_session_id').on(
      table.sessionId
    ),
    /**
     * Partial unique index: once a sessionId is claimed (userId set), no other
     * row with that same sessionId can ever be claimed onto a different user.
     * Pre-claim rows (userId IS NULL) are exempt — multiple anonymous turns
     * can share a session id naturally.
     */
    sessionIdClaimedUnique: uniqueIndex(
      'idx_chat_conversations_session_id_claimed_unique'
    )
      .on(table.sessionId)
      .where(
        drizzleSql`${table.userId} IS NOT NULL AND ${table.sessionId} IS NOT NULL`
      ),
    /** Every row must have at least one identifier — user or session. */
    identityCheck: check(
      'chat_conversations_identity_check',
      drizzleSql`${table.userId} IS NOT NULL OR ${table.sessionId} IS NOT NULL`
    ),
  })
);

/**
 * Chat messages table.
 * Stores individual messages within conversations.
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: chatMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    toolCalls: jsonb('tool_calls'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    conversationIdIdx: index('idx_chat_messages_conversation_id').on(
      table.conversationId
    ),
    createdAtIdx: index('idx_chat_messages_created_at').on(table.createdAt),
  })
);

/**
 * Chat audit log table.
 * Tracks profile edits made through the chat interface for security and rollback.
 */
export const chatAuditLog = pgTable(
  'chat_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Nullable to support pre-profile claim records (JOV-2132): when an
    // anonymous onboarding session is claimed onto a new Clerk user before
    // a creator profile exists, the audit row references the conversation
    // but has no profile yet.
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'cascade' }
    ),
    conversationId: uuid('conversation_id').references(
      () => chatConversations.id,
      { onDelete: 'set null' }
    ),
    messageId: uuid('message_id').references(() => chatMessages.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    field: text('field').notNull(),
    previousValue: text('previous_value'),
    newValue: text('new_value'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('idx_chat_audit_log_user_id').on(table.userId),
    creatorProfileIdIdx: index('idx_chat_audit_log_creator_profile_id').on(
      table.creatorProfileId
    ),
    conversationIdIdx: index('idx_chat_audit_log_conversation_id').on(
      table.conversationId
    ),
    messageIdIdx: index('idx_chat_audit_log_message_id').on(table.messageId),

    actionIdx: index('idx_chat_audit_log_action').on(table.action),
    createdAtIdx: index('idx_chat_audit_log_created_at').on(table.createdAt),
  })
);

// Schema validations
export const insertChatConversationSchema =
  createInsertSchema(chatConversations);
export const selectChatConversationSchema =
  createSelectSchema(chatConversations);

export const insertChatMessageSchema = createInsertSchema(chatMessages);
export const selectChatMessageSchema = createSelectSchema(chatMessages);

export const insertChatAuditLogSchema = createInsertSchema(chatAuditLog);
export const selectChatAuditLogSchema = createSelectSchema(chatAuditLog);

// Types
export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type ChatAuditLog = typeof chatAuditLog.$inferSelect;
export type NewChatAuditLog = typeof chatAuditLog.$inferInsert;
