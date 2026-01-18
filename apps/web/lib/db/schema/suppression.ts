import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { notificationSubscriptions } from './analytics';
import { users } from './auth';
import {
  deliveryStatusEnum,
  notificationChannelEnum,
  suppressionReasonEnum,
} from './enums';

/**
 * Metadata for suppression entries
 */
export interface SuppressionMetadata {
  bounceCode?: string;
  bounceMessage?: string;
  complaintType?: string;
  originalEmail?: string; // Stored only for admin lookup, not exposed
  notes?: string;
}

/**
 * Global email suppression list
 * Tracks emails that should never receive notifications
 */
export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 hash of lowercase email for privacy + fast lookup
    emailHash: text('email_hash').notNull(),
    reason: suppressionReasonEnum('reason').notNull(),
    // Source of the suppression: 'webhook', 'manual', 'api', 'list_import'
    source: text('source').notNull(),
    // Provider's event ID if from webhook (e.g., Resend event ID)
    sourceEventId: text('source_event_id'),
    // Additional context (bounce code, complaint type, etc.)
    metadata: jsonb('metadata').$type<SuppressionMetadata>().default({}),
    // NULL = permanent, set for soft bounces that expire
    expiresAt: timestamp('expires_at'),
    // NULL for automated suppressions
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Fast lookup by email hash
    emailHashIdx: index('email_suppressions_email_hash_idx').on(
      table.emailHash
    ),
    // Unique constraint per email + reason (can have multiple reasons)
    emailHashReasonUnique: uniqueIndex(
      'email_suppressions_email_hash_reason_unique'
    ).on(table.emailHash, table.reason),
    // Find expiring suppressions for cleanup
    expiresAtIdx: index('email_suppressions_expires_at_idx').on(
      table.expiresAt
    ),
  })
);

/**
 * Raw webhook events from email providers
 * Stored for debugging and compliance auditing
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Email provider: 'resend', 'twilio', etc.
    provider: text('provider').notNull(),
    // Event type: 'email.bounced', 'email.complained', etc.
    eventType: text('event_type').notNull(),
    // Provider's unique event ID
    eventId: text('event_id').notNull(),
    // Raw webhook payload
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    // Processing status
    processed: boolean('processed').default(false).notNull(),
    processedAt: timestamp('processed_at'),
    // Error message if processing failed
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Unique constraint on provider + event ID to prevent duplicates
    providerEventIdUnique: uniqueIndex(
      'webhook_events_provider_event_id_unique'
    ).on(table.provider, table.eventId),
    // Find unprocessed events for retry
    unprocessedIdx: index('webhook_events_unprocessed_idx').on(table.createdAt),
  })
);

/**
 * Metadata for delivery log entries
 */
export interface DeliveryLogMetadata {
  notificationType?: string;
  artistId?: string;
  artistName?: string;
  releaseId?: string;
  releaseName?: string;
  suppressionReason?: string;
}

/**
 * Notification delivery log for debugging and compliance
 * Tracks every notification send attempt and its outcome
 */
export const notificationDeliveryLog = pgTable(
  'notification_delivery_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Optional reference to the subscription
    notificationSubscriptionId: uuid('notification_subscription_id').references(
      () => notificationSubscriptions.id,
      { onDelete: 'set null' }
    ),
    channel: notificationChannelEnum('channel').notNull(),
    // SHA-256 hash of recipient email/phone for privacy
    recipientHash: text('recipient_hash').notNull(),
    status: deliveryStatusEnum('status').notNull(),
    // Provider's message ID (e.g., Resend message ID)
    providerMessageId: text('provider_message_id'),
    // Error message if failed
    errorMessage: text('error_message'),
    // Additional context
    metadata: jsonb('metadata').$type<DeliveryLogMetadata>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Find deliveries by recipient
    recipientHashIdx: index('notification_delivery_log_recipient_hash_idx').on(
      table.recipientHash
    ),
    // Analytics queries by time
    createdAtIdx: index('notification_delivery_log_created_at_idx').on(
      table.createdAt
    ),
    // Find deliveries by subscription
    subscriptionIdx: index('notification_delivery_log_subscription_idx').on(
      table.notificationSubscriptionId
    ),
  })
);

/**
 * Category-level subscriptions (e.g., "all artists", "all podcasters")
 * Allows users to opt out of entire categories while maintaining per-artist preferences
 */
export const categorySubscriptions = pgTable(
  'category_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 hash of email for privacy + fast lookup
    emailHash: text('email_hash').notNull(),
    // Category key: 'all_artists', 'all_podcasters', 'platform_updates'
    categoryKey: text('category_key').notNull(),
    // Whether subscribed to this category
    subscribed: boolean('subscribed').default(true).notNull(),
    // Category-specific preferences
    preferences: jsonb('preferences')
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Fast lookup by email hash
    emailHashIdx: index('category_subscriptions_email_hash_idx').on(
      table.emailHash
    ),
    // Unique constraint per email + category
    emailHashCategoryUnique: uniqueIndex(
      'category_subscriptions_email_hash_category_unique'
    ).on(table.emailHash, table.categoryKey),
  })
);

/**
 * Signed unsubscribe tokens for secure link-based unsubscribe
 */
export const unsubscribeTokens = pgTable(
  'unsubscribe_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 hash of the token for lookup
    tokenHash: text('token_hash').notNull().unique(),
    // SHA-256 hash of the email
    emailHash: text('email_hash').notNull(),
    // Scope type: 'artist', 'category', 'global'
    scopeType: text('scope_type').notNull(),
    // Scope ID: artist_id or category_key (null for global)
    scopeId: text('scope_id'),
    // When the token was used (null if unused)
    usedAt: timestamp('used_at'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Fast lookup by token hash
    tokenHashIdx: index('unsubscribe_tokens_token_hash_idx').on(
      table.tokenHash
    ),
    // Find expired tokens for cleanup
    expiresAtIdx: index('unsubscribe_tokens_expires_at_idx').on(
      table.expiresAt
    ),
  })
);

// Schema validations
export const insertEmailSuppressionSchema =
  createInsertSchema(emailSuppressions);
export const selectEmailSuppressionSchema =
  createSelectSchema(emailSuppressions);

export const insertWebhookEventSchema = createInsertSchema(webhookEvents);
export const selectWebhookEventSchema = createSelectSchema(webhookEvents);

export const insertNotificationDeliveryLogSchema = createInsertSchema(
  notificationDeliveryLog
);
export const selectNotificationDeliveryLogSchema = createSelectSchema(
  notificationDeliveryLog
);

export const insertCategorySubscriptionSchema = createInsertSchema(
  categorySubscriptions
);
export const selectCategorySubscriptionSchema = createSelectSchema(
  categorySubscriptions
);

export const insertUnsubscribeTokenSchema =
  createInsertSchema(unsubscribeTokens);
export const selectUnsubscribeTokenSchema =
  createSelectSchema(unsubscribeTokens);

// Types
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

export type NotificationDeliveryLog =
  typeof notificationDeliveryLog.$inferSelect;
export type NewNotificationDeliveryLog =
  typeof notificationDeliveryLog.$inferInsert;

export type CategorySubscription = typeof categorySubscriptions.$inferSelect;
export type NewCategorySubscription = typeof categorySubscriptions.$inferInsert;

export type UnsubscribeToken = typeof unsubscribeTokens.$inferSelect;
export type NewUnsubscribeToken = typeof unsubscribeTokens.$inferInsert;
