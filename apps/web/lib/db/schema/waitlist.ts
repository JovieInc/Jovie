import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
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
    emailNormalized: text('email_normalized').notNull(),
    emailHash: text('email_hash'),
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
    statusReason: text('status_reason'),
    source: text('source').default('waitlist_form').notNull(),
    canonical: boolean('canonical').default(true).notNull(),
    qualificationInputs: jsonb('qualification_inputs').$type<
      Record<string, unknown>
    >(),
    qualificationResult: jsonb('qualification_result').$type<
      Record<string, unknown>
    >(),
    inviteTokenHash: text('invite_token_hash'),
    inviteTokenExpiresAt: timestamp('invite_token_expires_at'),
    inviteTokenRedeemedAt: timestamp('invite_token_redeemed_at'),
    waitlistEmailStatus: text('waitlist_email_status'),
    waitlistEmailProviderMessageId: text('waitlist_email_provider_message_id'),
    waitlistEmailLastError: text('waitlist_email_last_error'),
    waitlistEmailSentAt: timestamp('waitlist_email_sent_at'),
    inviteEmailStatus: text('invite_email_status'),
    inviteEmailProviderMessageId: text('invite_email_provider_message_id'),
    inviteEmailLastError: text('invite_email_last_error'),
    inviteEmailSentAt: timestamp('invite_email_sent_at'),
    qualifiedAt: timestamp('qualified_at'),
    waitlistedAt: timestamp('waitlisted_at'),
    approvedAt: timestamp('approved_at'),
    invitedAt: timestamp('invited_at'),
    signedUpAt: timestamp('signed_up_at'),
    rejectedAt: timestamp('rejected_at'),
    expiredAt: timestamp('expired_at'),
    blockedAt: timestamp('blocked_at'),
    adminActorId: text('admin_actor_id'),
    primarySocialFollowerCount: integer('primary_social_follower_count'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Performance index: email lookups for waitlist access checks
    emailIndex: index('idx_waitlist_entries_email').on(table.email),
    emailNormalizedUnique: uniqueIndex(
      'idx_waitlist_entries_email_normalized_canonical_unique'
    )
      .on(table.emailNormalized)
      .where(drizzleSql`canonical = true`),
    emailNormalizedIndex: index('idx_waitlist_entries_email_normalized').on(
      table.emailNormalized
    ),
    statusCreatedAtIndex: index('idx_waitlist_entries_status_created_at').on(
      table.status,
      table.createdAt
    ),
    statusWaitlistedAtIndex: index(
      'idx_waitlist_entries_status_waitlisted_at'
    ).on(table.status, table.waitlistedAt),
    inviteTokenHashIndex: index('idx_waitlist_entries_invite_token_hash').on(
      table.inviteTokenHash
    ),
  })
);

export const waitlistAuditLogs = pgTable(
  'waitlist_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    waitlistEntryId: uuid('waitlist_entry_id')
      .notNull()
      .references(() => waitlistEntries.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id'),
    actorType: text('actor_type').default('system').notNull(),
    fromStatus: waitlistStatusEnum('from_status'),
    toStatus: waitlistStatusEnum('to_status').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    waitlistEntryCreatedAtIndex: index(
      'idx_waitlist_audit_logs_entry_created_at'
    ).on(table.waitlistEntryId, table.createdAt),
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
export const waitlistSettings = pgTable(
  'waitlist_settings',
  {
    id: integer('id').primaryKey().default(1),
    gateEnabled: boolean('gate_enabled').default(true).notNull(),
    autoAcceptEnabled: boolean('auto_accept_enabled').default(false).notNull(),
    autoAcceptAfterDays: integer('auto_accept_after_days').default(7).notNull(),
    autoAcceptDailyLimit: integer('auto_accept_daily_limit')
      .default(0)
      .notNull(),
    autoAcceptedToday: integer('auto_accepted_today').default(0).notNull(),
    autoAcceptResetsAt: timestamp('auto_accept_resets_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    autoAcceptAfterDaysRange: check(
      'waitlist_settings_auto_accept_after_days_range',
      drizzleSql`${table.autoAcceptAfterDays} >= 1 AND ${table.autoAcceptAfterDays} <= 365`
    ),
  })
);

// Schema validations
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries);
export const selectWaitlistEntrySchema = createSelectSchema(waitlistEntries);
export const insertWaitlistAuditLogSchema =
  createInsertSchema(waitlistAuditLogs);
export const selectWaitlistAuditLogSchema =
  createSelectSchema(waitlistAuditLogs);

export const insertWaitlistInviteSchema = createInsertSchema(waitlistInvites);
export const selectWaitlistInviteSchema = createSelectSchema(waitlistInvites);
export const insertWaitlistSettingsSchema =
  createInsertSchema(waitlistSettings);
export const selectWaitlistSettingsSchema =
  createSelectSchema(waitlistSettings);

// Types
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;
export type WaitlistAuditLog = typeof waitlistAuditLogs.$inferSelect;
export type NewWaitlistAuditLog = typeof waitlistAuditLogs.$inferInsert;

export type WaitlistInvite = typeof waitlistInvites.$inferSelect;
export type NewWaitlistInvite = typeof waitlistInvites.$inferInsert;
export type WaitlistSettings = typeof waitlistSettings.$inferSelect;
