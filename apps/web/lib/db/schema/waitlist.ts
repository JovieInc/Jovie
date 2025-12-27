import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { creatorProfiles } from './creators';

/**
 * Waitlist domain schema.
 * Invite-only access management for creator onboarding.
 * Depends on: creators (for foreign key references)
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Status of a waitlist entry.
 */
export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'new',
  'invited',
  'claimed',
  'rejected',
]);

/**
 * Status of a waitlist invite email.
 */
export const waitlistInviteStatusEnum = pgEnum('waitlist_invite_status', [
  'pending',
  'sending',
  'sent',
  'failed',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Waitlist entries - users waiting for invite-only access.
 * Stores signup information and tracks status through the invite flow.
 */
export const waitlistEntries = pgTable('waitlist_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  primarySocialUrl: text('primary_social_url').notNull(),
  primarySocialPlatform: text('primary_social_platform').notNull(),
  primarySocialUrlNormalized: text('primary_social_url_normalized').notNull(),
  spotifyUrl: text('spotify_url'),
  spotifyUrlNormalized: text('spotify_url_normalized'),
  heardAbout: text('heard_about'),
  primaryGoal: text('primary_goal'),
  selectedPlan: text('selected_plan'), // free|pro|growth|branding - quietly tracks pricing tier interest
  status: waitlistStatusEnum('status').default('new').notNull(),
  primarySocialFollowerCount: integer('primary_social_follower_count'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Waitlist invites - invite emails sent to waitlist entries.
 * Tracks email delivery status and claim tokens.
 */
export const waitlistInvites = pgTable(
  'waitlist_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    waitlistEntryId: uuid('waitlist_entry_id')
      .notNull()
      .references(() => waitlistEntries.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    claimToken: text('claim_token').notNull(),
    status: waitlistInviteStatusEnum('status').default('pending').notNull(),
    error: text('error'),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    runAt: timestamp('run_at').defaultNow().notNull(),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    waitlistEntryIdUnique: uniqueIndex('idx_waitlist_invites_entry_id').on(
      table.waitlistEntryId
    ),
  })
);
