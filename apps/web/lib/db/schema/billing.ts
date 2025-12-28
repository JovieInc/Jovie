import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { creatorProfiles } from './creators';
import { users } from './users';

/**
 * Billing domain schema.
 * Payments, tips, Stripe webhooks, and billing audit trail.
 * Depends on: users, creators (for foreign key references)
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * ISO 4217 currency codes for payment processing.
 */
export const currencyCodeEnum = pgEnum('currency_code', [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Tips - fan payments to creators.
 * Tracks payment amounts, Stripe payment intents, and optional contact info.
 */
export const tips = pgTable(
  'tips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    currency: currencyCodeEnum('currency').notNull().default('USD'),
    paymentIntentId: text('payment_intent_id').notNull().unique(),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    message: text('message'),
    isAnonymous: boolean('is_anonymous').default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Index for payment tracking queries filtered by creator
    // Query pattern: WHERE creator_profile_id = ?
    creatorProfileIdx: index('tips_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
  })
);

/**
 * Stripe webhook events - tracks all incoming Stripe webhooks for idempotency.
 * Used to prevent duplicate processing of events.
 */
export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  stripeEventId: text('stripe_event_id').notNull().unique(),
  type: text('type').notNull(),
  stripeObjectId: text('stripe_object_id'),
  userClerkId: text('user_clerk_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  processedAt: timestamp('processed_at'),
  stripeCreatedAt: timestamp('stripe_created_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Billing audit log - tracks subscription state changes for debugging and compliance.
 * Stores before/after state snapshots with Stripe event correlation.
 */
export const billingAuditLog = pgTable(
  'billing_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    previousState: jsonb('previous_state')
      .$type<Record<string, unknown>>()
      .default({}),
    newState: jsonb('new_state').$type<Record<string, unknown>>().default({}),
    stripeEventId: text('stripe_event_id'),
    source: text('source').notNull().default('webhook'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdIdx: index('billing_audit_log_user_id_idx').on(table.userId),
    stripeEventIdIdx: index('billing_audit_log_stripe_event_id_idx').on(
      table.stripeEventId
    ),
    createdAtIdx: index('billing_audit_log_created_at_idx').on(table.createdAt),
  })
);
