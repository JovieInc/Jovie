import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  inboxEmailCategoryEnum,
  inboxOutboundSentByEnum,
  inboxThreadPriorityEnum,
  inboxThreadStatusEnum,
} from './enums';
import { creatorContacts, creatorProfiles } from './profiles';

/**
 * Inbound emails table.
 * Stores raw incoming emails received at artist@jovie.fm addresses.
 */
export const inboundEmails = pgTable(
  'inbound_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').references(() => emailThreads.id, {
      onDelete: 'set null',
    }),
    messageId: text('message_id'),
    inReplyTo: text('in_reply_to'),
    references: jsonb('references').$type<string[]>().default([]),
    fromEmail: text('from_email').notNull(),
    fromName: text('from_name'),
    toEmail: text('to_email').notNull(),
    ccEmails: jsonb('cc_emails').$type<string[]>().default([]),
    subject: text('subject'),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    strippedText: text('stripped_text'),
    attachments: jsonb('attachments')
      .$type<
        {
          filename: string;
          contentType: string;
          size: number;
          storageKey?: string;
        }[]
      >()
      .default([]),
    rawHeaders: jsonb('raw_headers').$type<Record<string, string>>(),
    resendEmailId: text('resend_email_id'),
    receivedAt: timestamp('received_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    profileReceivedIdx: index('idx_inbound_emails_profile_received').on(
      table.creatorProfileId,
      table.receivedAt
    ),
    threadIdx: index('idx_inbound_emails_thread').on(table.threadId),
    messageIdIdx: index('idx_inbound_emails_message_id').on(table.messageId),
    fromEmailIdx: index('idx_inbound_emails_from_email').on(table.fromEmail),
  })
);

/**
 * Email threads table.
 * Groups inbound emails into conversations with AI classification and routing status.
 */
export const emailThreads = pgTable(
  'email_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    subject: text('subject'),
    category: inboxEmailCategoryEnum('category'),
    suggestedCategory: inboxEmailCategoryEnum('suggested_category'),
    suggestedTerritory: text('suggested_territory'),
    categoryConfidence: real('category_confidence'),
    territory: text('territory'),
    priority: inboxThreadPriorityEnum('priority').default('medium'),
    status: inboxThreadStatusEnum('status').notNull().default('pending_review'),
    routedToContactId: uuid('routed_to_contact_id').references(
      () => creatorContacts.id,
      { onDelete: 'set null' }
    ),
    routedAt: timestamp('routed_at'),
    aiSummary: text('ai_summary'),
    aiExtractedData: jsonb('ai_extracted_data').$type<{
      senderOrganization?: string;
      senderRole?: string;
      proposedDates?: string[];
      budgetMentioned?: string;
      venueOrLocation?: string;
      requestType?: string;
    }>(),
    latestMessageAt: timestamp('latest_message_at').defaultNow().notNull(),
    messageCount: integer('message_count').notNull().default(1),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    profileStatusIdx: index('idx_email_threads_profile_status').on(
      table.creatorProfileId,
      table.status,
      table.latestMessageAt
    ),
    profileCategoryIdx: index('idx_email_threads_profile_category').on(
      table.creatorProfileId,
      table.category
    ),
    latestMessageIdx: index('idx_email_threads_latest_message').on(
      table.latestMessageAt
    ),
  })
);

/**
 * Outbound replies table.
 * Stores routing messages sent by Jovie on behalf of the artist.
 * Artists do NOT compose emails — only Jovie sends routing introductions.
 */
export const outboundReplies = pgTable(
  'outbound_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => emailThreads.id, { onDelete: 'cascade' }),
    inReplyToMessageId: text('in_reply_to_message_id'),
    toEmail: text('to_email').notNull(),
    ccEmails: jsonb('cc_emails').$type<string[]>().default([]),
    subject: text('subject'),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    sentBy: inboxOutboundSentByEnum('sent_by').notNull(),
    resendMessageId: text('resend_message_id'),
    sentAt: timestamp('sent_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    threadIdx: index('idx_outbound_replies_thread').on(
      table.threadId,
      table.sentAt
    ),
  })
);

// Schema validations
export const insertInboundEmailSchema = createInsertSchema(inboundEmails);
export const selectInboundEmailSchema = createSelectSchema(inboundEmails);

export const insertEmailThreadSchema = createInsertSchema(emailThreads);
export const selectEmailThreadSchema = createSelectSchema(emailThreads);

export const insertOutboundReplySchema = createInsertSchema(outboundReplies);
export const selectOutboundReplySchema = createSelectSchema(outboundReplies);

// Types
export type InboundEmail = typeof inboundEmails.$inferSelect;
export type NewInboundEmail = typeof inboundEmails.$inferInsert;

export type EmailThread = typeof emailThreads.$inferSelect;
export type NewEmailThread = typeof emailThreads.$inferInsert;

export type OutboundReply = typeof outboundReplies.$inferSelect;
export type NewOutboundReply = typeof outboundReplies.$inferInsert;
