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
import {
  themeModeEnum,
  userStatusEnum,
  userStatusLifecycleEnum,
  userWaitlistApprovalEnum,
} from './enums';

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkId: text('clerk_id').unique().notNull(),
    name: text('name'),
    email: text('email').unique(),

    // NEW: Single source of truth for user lifecycle
    userStatus: userStatusLifecycleEnum('user_status').notNull(),

    // DEPRECATED (2026-01): Remove after migration 0036 deploys and code stabilizes (2-4 weeks). Use userStatus instead.
    status: userStatusEnum('status').notNull().default('active'),
    // DEPRECATED (2026-01): Historical data only. Do not write to this field.
    waitlistEntryId: uuid('waitlist_entry_id'),
    // DEPRECATED (2026-01): Remove after migration 0036 deploys and code stabilizes (2-4 weeks). Use userStatus instead.
    waitlistApproval: userWaitlistApprovalEnum('waitlist_approval'),

    isAdmin: boolean('is_admin').default(false).notNull(),
    isPro: boolean('is_pro').default(false),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    billingUpdatedAt: timestamp('billing_updated_at'),
    billingVersion: integer('billing_version').default(1).notNull(),
    lastBillingEventAt: timestamp('last_billing_event_at'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // NEW: Primary index for user lifecycle state
    userStatusIdx: index('idx_users_user_status').on(table.userStatus),

    // DEPRECATED: Legacy indexes (dropped in migration 0036)
    // These are commented out because the indexes no longer exist in the database
    // statusIdx: index('idx_users_status').on(table.status),
    // waitlistEntryIdIdx: index('idx_users_waitlist_entry_id').on(table.waitlistEntryId),
    // waitlistApprovalIdx: index('idx_users_waitlist_approval').on(table.waitlistApproval),
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
