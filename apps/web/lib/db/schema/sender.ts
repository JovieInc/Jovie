import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { senderStatusEnum } from './enums';
import { creatorProfiles } from './profiles';

/**
 * Metadata for quota entries
 */
export interface QuotaMetadata {
  /** Plan tier that determines limits */
  planTier?: 'free' | 'pro' | 'enterprise';
  /** Reason for any custom limit overrides */
  overrideReason?: string;
  /** Admin who set the override */
  overrideBy?: string;
}

/**
 * Creator email quotas for rate limiting
 * Tracks daily and monthly sending limits per creator
 */
export const creatorEmailQuotas = pgTable(
  'creator_email_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' })
      .unique(),

    // Current period counters
    dailySent: integer('daily_sent').default(0).notNull(),
    monthlySent: integer('monthly_sent').default(0).notNull(),

    // Limits (can be overridden per creator)
    dailyLimit: integer('daily_limit').default(1000).notNull(),
    monthlyLimit: integer('monthly_limit').default(25000).notNull(),

    // Period reset timestamps
    dailyResetAt: timestamp('daily_reset_at').notNull(),
    monthlyResetAt: timestamp('monthly_reset_at').notNull(),

    // Override flag for custom limits
    hasCustomLimits: boolean('has_custom_limits').default(false).notNull(),

    // Additional metadata
    metadata: jsonb('metadata').$type<QuotaMetadata>().default({}),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileIdIdx: index(
      'creator_email_quotas_creator_profile_id_idx'
    ).on(table.creatorProfileId),
    dailyResetIdx: index('creator_email_quotas_daily_reset_idx').on(
      table.dailyResetAt
    ),
    monthlyResetIdx: index('creator_email_quotas_monthly_reset_idx').on(
      table.monthlyResetAt
    ),
  })
);

/**
 * Metadata for reputation entries
 */
export interface ReputationMetadata {
  /** Timestamp of last status change */
  lastStatusChange?: string;
  /** Reason for current status */
  statusReason?: string;
  /** Admin notes */
  adminNotes?: string;
  /** Warning sent timestamp */
  warningSentAt?: string;
}

/**
 * Creator sending reputation for spam protection
 * Tracks bounce/complaint rates and auto-suspends bad actors
 */
export const creatorSendingReputation = pgTable(
  'creator_sending_reputation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' })
      .unique(),

    // Lifetime counters
    totalSent: integer('total_sent').default(0).notNull(),
    totalDelivered: integer('total_delivered').default(0).notNull(),
    totalBounced: integer('total_bounced').default(0).notNull(),
    totalComplaints: integer('total_complaints').default(0).notNull(),

    // Rolling 30-day counters (for rate calculation)
    recentSent: integer('recent_sent').default(0).notNull(),
    recentBounced: integer('recent_bounced').default(0).notNull(),
    recentComplaints: integer('recent_complaints').default(0).notNull(),

    // Calculated rates (updated on each event)
    bounceRate: real('bounce_rate').default(0).notNull(),
    complaintRate: real('complaint_rate').default(0).notNull(),

    // Sender status
    status: senderStatusEnum('status').default('good').notNull(),

    // Suspension details
    suspendedAt: timestamp('suspended_at'),
    suspendedUntil: timestamp('suspended_until'),
    suspensionReason: text('suspension_reason'),

    // Warning tracking
    warningCount: integer('warning_count').default(0).notNull(),
    lastWarningAt: timestamp('last_warning_at'),

    // Rolling window reset
    rollingWindowResetAt: timestamp('rolling_window_reset_at').notNull(),

    // Additional metadata
    metadata: jsonb('metadata').$type<ReputationMetadata>().default({}),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileIdIdx: index(
      'creator_sending_reputation_creator_profile_id_idx'
    ).on(table.creatorProfileId),
    statusIdx: index('creator_sending_reputation_status_idx').on(table.status),
    bounceRateIdx: index('creator_sending_reputation_bounce_rate_idx').on(
      table.bounceRate
    ),
    complaintRateIdx: index('creator_sending_reputation_complaint_rate_idx').on(
      table.complaintRate
    ),
    rollingWindowResetIdx: index(
      'creator_sending_reputation_rolling_window_reset_idx'
    ).on(table.rollingWindowResetAt),
  })
);

/**
 * Email send attribution for tracking which creator sent each email
 * Used to attribute bounces/complaints back to the sending creator
 */
export const emailSendAttribution = pgTable(
  'email_send_attribution',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Resend message ID for webhook correlation
    providerMessageId: text('provider_message_id').notNull(),
    // The creator who triggered this send
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    // SHA-256 hash of recipient email
    recipientHash: text('recipient_hash').notNull(),
    // Type of email sent
    emailType: text('email_type').notNull(), // 'release_notification', 'claim_invite', etc.
    // Reference to the specific notification/entity
    referenceId: text('reference_id'),
    // Timestamps
    sentAt: timestamp('sent_at').defaultNow().notNull(),
    // TTL for cleanup (30 days is enough for webhook correlation)
    expiresAt: timestamp('expires_at').notNull(),
  },
  table => ({
    // Fast lookup by provider message ID (used in webhook handler)
    providerMessageIdIdx: uniqueIndex(
      'email_send_attribution_provider_message_id_idx'
    ).on(table.providerMessageId),
    // Find attributions by creator
    creatorProfileIdIdx: index(
      'email_send_attribution_creator_profile_id_idx'
    ).on(table.creatorProfileId),
    // Cleanup expired records
    expiresAtIdx: index('email_send_attribution_expires_at_idx').on(
      table.expiresAt
    ),
  })
);

// Schema validations
export const insertCreatorEmailQuotaSchema =
  createInsertSchema(creatorEmailQuotas);
export const selectCreatorEmailQuotaSchema =
  createSelectSchema(creatorEmailQuotas);

export const insertCreatorSendingReputationSchema = createInsertSchema(
  creatorSendingReputation
);
export const selectCreatorSendingReputationSchema = createSelectSchema(
  creatorSendingReputation
);

export const insertEmailSendAttributionSchema =
  createInsertSchema(emailSendAttribution);
export const selectEmailSendAttributionSchema =
  createSelectSchema(emailSendAttribution);

// Types
export type CreatorEmailQuota = typeof creatorEmailQuotas.$inferSelect;
export type NewCreatorEmailQuota = typeof creatorEmailQuotas.$inferInsert;

export type CreatorSendingReputation =
  typeof creatorSendingReputation.$inferSelect;
export type NewCreatorSendingReputation =
  typeof creatorSendingReputation.$inferInsert;

export type EmailSendAttribution = typeof emailSendAttribution.$inferSelect;
export type NewEmailSendAttribution = typeof emailSendAttribution.$inferInsert;
