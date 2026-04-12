import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { themeModeEnum, userStatusLifecycleEnum } from './enums';

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkId: text('clerk_id').unique().notNull(),
    name: text('name'),
    email: text('email').unique(),

    // Single source of truth for user lifecycle
    userStatus: userStatusLifecycleEnum('user_status').notNull(),

    // Historical waitlist entry reference (used by auth gate logic)
    waitlistEntryId: uuid('waitlist_entry_id'),

    isAdmin: boolean('is_admin').default(false).notNull(),
    isPro: boolean('is_pro').default(false),
    plan: text('plan').default('free'), // 'free' | 'trial' | 'pro' | 'max'
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    stripePriceId: text('stripe_price_id'),
    billingUpdatedAt: timestamp('billing_updated_at'),
    billingVersion: integer('billing_version').default(1).notNull(),
    lastBillingEventAt: timestamp('last_billing_event_at'),
    // Lifecycle email tracking
    founderWelcomeSentAt: timestamp('founder_welcome_sent_at'),
    welcomeFailedAt: timestamp('welcome_failed_at'),
    outboundSuppressedAt: timestamp('outbound_suppressed_at'),
    suppressionFailedAt: timestamp('suppression_failed_at'),
    // Max plan beta access request
    growthAccessRequestedAt: timestamp('growth_access_requested_at'),
    growthAccessReason: text('growth_access_reason'),
    // Reverse trial tracking
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    trialConvertedAt: timestamp('trial_converted_at', { withTimezone: true }),
    trialNotificationsSent: integer('trial_notifications_sent').default(0),
    // Active creator profile (FK added post-create to avoid circular dependency)
    activeProfileId: uuid('active_profile_id'),
    // Referral tracking
    referredByCode: text('referred_by_code'), // The referral code used at signup
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userStatusIdx: index('idx_users_user_status').on(table.userStatus),
    activeProfileIdx: index('idx_users_active_profile_id')
      .on(table.activeProfileId)
      .where(drizzleSql`active_profile_id IS NOT NULL`),
  })
);

// Per-user settings (separate from creator profile)
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  themeMode: themeModeEnum('theme_mode').notNull().default('system'),
  sidebarCollapsed: boolean('sidebar_collapsed').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Schema validations
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
