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
import { chatMessageRoleEnum } from './enums';
import { creatorProfiles } from './profiles';

/**
 * Chat conversations table.
 * Stores conversation metadata for persistent chat history.
 */
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
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
    toolCalls: jsonb('tool_calls').$type<Record<string, unknown>[]>(),
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
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
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
