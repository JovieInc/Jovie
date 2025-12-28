import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * User domain schema.
 * Core identity and authentication tables - no dependencies on other domain tables.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Theme preference for user interface.
 */
export const themeModeEnum = pgEnum('theme_mode', ['system', 'light', 'dark']);

/**
 * Subscription plan tiers for users.
 */
export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'free',
  'basic',
  'premium',
  'pro',
]);

/**
 * Subscription status states for billing.
 */
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'inactive',
  'cancelled',
  'past_due',
  'trialing',
  'incomplete',
  'incomplete_expired',
  'unpaid',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Core users table - authenticated via Clerk.
 * Stores user identity, billing info, and account status.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').unique().notNull(),
  name: text('name'),
  email: text('email').unique(),
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
});

/**
 * Per-user settings (separate from creator profile).
 * Stores UI preferences like theme and sidebar state.
 */
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  themeMode: themeModeEnum('theme_mode').notNull().default('system'),
  sidebarCollapsed: boolean('sidebar_collapsed').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
