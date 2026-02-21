import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { waitlistInviteStatusEnum, waitlistStatusEnum } from './enums';
// eslint-disable-next-line import/no-cycle -- mutual reference with profiles schema
import { creatorProfiles } from './profiles';

// Waitlist entries for invite-only access
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    primarySocialUrl: text('primary_social_url').notNull(),
    primarySocialPlatform: text('primary_social_platform').notNull(),
    primarySocialUrlNormalized: text('primary_social_url_normalized').notNull(),
    spotifyUrl: text('spotify_url'),
    spotifyUrlNormalized: text('spotify_url_normalized'),
    spotifyArtistName: text('spotify_artist_name'),
    heardAbout: text('heard_about'),
    primaryGoal: text('primary_goal'),
    selectedPlan: text('selected_plan'),
    status: waitlistStatusEnum('status').default('new').notNull(),
    primarySocialFollowerCount: integer('primary_social_follower_count'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Performance index: email lookups for waitlist access checks
    emailIndex: index('idx_waitlist_entries_email').on(table.email),
  })
);

// Waitlist invites table
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
    claimTokenUnique: uniqueIndex('idx_waitlist_invites_claim_token_unique').on(
      table.claimToken
    ),
  })
);

// Admin-configurable waitlist gating and auto-accept settings (singleton row)
export const waitlistSettings = pgTable('waitlist_settings', {
  id: integer('id').primaryKey().default(1),
  gateEnabled: boolean('gate_enabled').default(true).notNull(),
  autoAcceptEnabled: boolean('auto_accept_enabled').default(false).notNull(),
  autoAcceptDailyLimit: integer('auto_accept_daily_limit').default(0).notNull(),
  autoAcceptedToday: integer('auto_accepted_today').default(0).notNull(),
  autoAcceptResetsAt: timestamp('auto_accept_resets_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Schema validations
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries);
export const selectWaitlistEntrySchema = createSelectSchema(waitlistEntries);

export const insertWaitlistInviteSchema = createInsertSchema(waitlistInvites);
export const selectWaitlistInviteSchema = createSelectSchema(waitlistInvites);
export const insertWaitlistSettingsSchema =
  createInsertSchema(waitlistSettings);
export const selectWaitlistSettingsSchema =
  createSelectSchema(waitlistSettings);

// Types
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;

export type WaitlistInvite = typeof waitlistInvites.$inferSelect;
export type NewWaitlistInvite = typeof waitlistInvites.$inferInsert;
export type WaitlistSettings = typeof waitlistSettings.$inferSelect;
