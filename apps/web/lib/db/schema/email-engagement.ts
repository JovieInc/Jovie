/**
 * Email Engagement Schema
 *
 * Tracks opens and clicks for email campaigns.
 * Used for analytics and conversion tracking.
 */

import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Note: uniqueIndex is imported but not used in table definitions
// The partial unique index for opens is created directly in migration SQL
// because Drizzle doesn't support WHERE clause on unique indexes
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

/**
 * Email engagement event types
 */
export type EmailEngagementEventType = 'open' | 'click';

/**
 * Email types that support engagement tracking
 */
export type TrackedEmailType =
  | 'claim_invite'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'follow_up_3'
  | 'release_notification'
  | 'campaign';

/**
 * Metadata for engagement events
 */
export interface EmailEngagementMetadata {
  /** The URL that was clicked (for click events) */
  clickUrl?: string;
  /** User agent of the client */
  userAgent?: string;
  /** IP address (hashed for privacy) */
  ipHash?: string;
  /** Device type inferred from UA */
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  /** Country from geo headers */
  country?: string;
  /** City from geo headers */
  city?: string;
  /** Link identifier for click attribution */
  linkId?: string;
}

/**
 * Email engagement events
 * Tracks opens and clicks for all tracked email types
 */
export const emailEngagement = pgTable(
  'email_engagement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The type of email that was engaged with
    emailType: text('email_type').$type<TrackedEmailType>().notNull(),
    // The type of engagement event
    eventType: text('event_type').$type<EmailEngagementEventType>().notNull(),
    // Reference to the specific email/invite/campaign
    referenceId: uuid('reference_id').notNull(),
    // SHA-256 hash of recipient email for privacy
    recipientHash: text('recipient_hash').notNull(),
    // Provider message ID (e.g., Resend message ID)
    providerMessageId: text('provider_message_id'),
    // Additional event metadata
    metadata: jsonb('metadata').$type<EmailEngagementMetadata>().default({}),
    // When the event occurred
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Find engagement by reference (invite, campaign, etc.)
    referenceIdx: index('email_engagement_reference_idx').on(table.referenceId),
    // Find engagement by recipient
    recipientIdx: index('email_engagement_recipient_idx').on(
      table.recipientHash
    ),
    // Find engagement by email type
    emailTypeIdx: index('email_engagement_email_type_idx').on(table.emailType),
    // Analytics by time
    createdAtIdx: index('email_engagement_created_at_idx').on(table.createdAt),
    // Note: Partial unique index for opens is created in migration SQL
    // (Drizzle doesn't support WHERE clause on unique indexes in table definition)
  })
);

/**
 * Drip campaign sequence definitions
 * Defines the steps in a multi-email campaign
 */
export const campaignSequences = pgTable(
  'campaign_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Unique identifier for the campaign (e.g., 'claim_invite_drip')
    campaignKey: text('campaign_key').notNull().unique(),
    // Human-readable name
    name: text('name').notNull(),
    // Description of the campaign
    description: text('description'),
    // Whether the campaign is active
    isActive: text('is_active').default('true').notNull(),
    // JSON array of steps with delays and conditions
    steps: jsonb('steps').$type<CampaignStep[]>().default([]).notNull(),
    // Metadata for the campaign
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    campaignKeyIdx: index('campaign_sequences_campaign_key_idx').on(
      table.campaignKey
    ),
  })
);

/**
 * Campaign step definition
 */
export interface CampaignStep {
  /** Step number (1-based) */
  stepNumber: number;
  /** Delay in hours from previous step (or enrollment) */
  delayHours: number;
  /** Email template to use */
  templateKey: string;
  /** Subject line (can include {{variables}}) */
  subject: string;
  /** Conditions that skip this step */
  skipConditions?: CampaignStepCondition[];
  /** Conditions that stop the entire campaign */
  stopConditions?: CampaignStepCondition[];
}

/**
 * Campaign step condition
 */
export interface CampaignStepCondition {
  /** Type of condition */
  type: 'opened' | 'clicked' | 'claimed' | 'unsubscribed' | 'bounced';
  /** Step number to check (for opened/clicked), or 'any' */
  stepNumber?: number | 'any';
}

/**
 * Campaign enrollments
 * Tracks which recipients are enrolled in which campaigns
 */
export const campaignEnrollments = pgTable(
  'campaign_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Reference to the campaign
    campaignSequenceId: uuid('campaign_sequence_id')
      .notNull()
      .references(() => campaignSequences.id, { onDelete: 'cascade' }),
    // Reference to the subject (e.g., creator profile ID for claim invites)
    subjectId: uuid('subject_id').notNull(),
    // SHA-256 hash of recipient email
    recipientHash: text('recipient_hash').notNull(),
    // Current step number (0 = just enrolled, 1 = first email sent, etc.)
    currentStep: text('current_step').default('0').notNull(),
    // Status of the enrollment
    status: text('status')
      .$type<'active' | 'completed' | 'stopped' | 'unsubscribed' | 'bounced'>()
      .default('active')
      .notNull(),
    // Reason for stopping (if status is 'stopped')
    stopReason: text('stop_reason'),
    // When each step was completed (JSON object: { "1": "2024-01-01T00:00:00Z" })
    stepCompletedAt: jsonb('step_completed_at')
      .$type<Record<string, string>>()
      .default({}),
    // When the next step should be processed
    nextStepAt: timestamp('next_step_at'),
    // Enrollment timestamp
    enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
    // Last update timestamp
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Find active enrollments that need processing
    nextStepIdx: index('campaign_enrollments_next_step_idx').on(
      table.nextStepAt
    ),
    // Find enrollments by campaign
    campaignIdx: index('campaign_enrollments_campaign_idx').on(
      table.campaignSequenceId
    ),
    // Find enrollments by subject (e.g., creator profile)
    subjectIdx: index('campaign_enrollments_subject_idx').on(table.subjectId),
    // Find enrollments by status
    statusIdx: index('campaign_enrollments_status_idx').on(table.status),
    // Unique enrollment per campaign + subject + recipient
    uniqueEnrollmentIdx: uniqueIndex('campaign_enrollments_unique_idx').on(
      table.campaignSequenceId,
      table.subjectId,
      table.recipientHash
    ),
  })
);

// Schema validations
export const insertEmailEngagementSchema = createInsertSchema(emailEngagement);
export const selectEmailEngagementSchema = createSelectSchema(emailEngagement);

export const insertCampaignSequenceSchema =
  createInsertSchema(campaignSequences);
export const selectCampaignSequenceSchema =
  createSelectSchema(campaignSequences);

export const insertCampaignEnrollmentSchema =
  createInsertSchema(campaignEnrollments);
export const selectCampaignEnrollmentSchema =
  createSelectSchema(campaignEnrollments);

// Types
export type EmailEngagement = typeof emailEngagement.$inferSelect;
export type NewEmailEngagement = typeof emailEngagement.$inferInsert;

export type CampaignSequence = typeof campaignSequences.$inferSelect;
export type NewCampaignSequence = typeof campaignSequences.$inferInsert;

export type CampaignEnrollment = typeof campaignEnrollments.$inferSelect;
export type NewCampaignEnrollment = typeof campaignEnrollments.$inferInsert;
