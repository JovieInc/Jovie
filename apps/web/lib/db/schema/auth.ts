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
    plan: text('plan').default('free'), // 'free' | 'pro' | 'growth'
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    billingUpdatedAt: timestamp('billing_updated_at'),
    billingVersion: integer('billing_version').default(1).notNull(),
    lastBillingEventAt: timestamp('last_billing_event_at'),
    // Growth plan beta access request
    growthAccessRequestedAt: timestamp('growth_access_requested_at'),
    growthAccessReason: text('growth_access_reason'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userStatusIdx: index('idx_users_user_status').on(table.userStatus),
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
