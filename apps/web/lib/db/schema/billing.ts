import { sql as drizzleSql } from 'drizzle-orm';
import {
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
import { users } from './auth';

// Stripe webhook events table
export const stripeWebhookEvents = pgTable(
  'stripe_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: text('stripe_event_id').notNull().unique(),
    type: text('type').notNull(),
    stripeObjectId: text('stripe_object_id'),
    userClerkId: text('user_clerk_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    processedAt: timestamp('processed_at'),
    processingStartedAt: timestamp('processing_started_at'),
    stripeCreatedAt: timestamp('stripe_created_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // A verified event that cannot be applied yet (for example a paid
    // subscription on an unmapped price) is acknowledged only after it is
    // marked here. Replay grants it once the cause is fixed.
    reconciliationStatus: text('reconciliation_status'),
    reconciliationReason: text('reconciliation_reason'),
    reconciliationContext: jsonb('reconciliation_context').$type<
      Record<string, unknown>
    >(),
    reconciliationFlaggedAt: timestamp('reconciliation_flagged_at'),
    reconciledAt: timestamp('reconciled_at'),
  },
  table => ({
    createdAtIdx: index('stripe_webhook_events_created_at_idx').on(
      table.createdAt
    ),
    reconciliationStatusCheck: check(
      'stripe_webhook_events_reconciliation_status_check',
      drizzleSql`${table.reconciliationStatus} IS NULL OR ${table.reconciliationStatus} IN ('needs_reconciliation', 'reconciled')`
    ),
  })
);

// Billing audit log for tracking subscription state changes
export const billingAuditLog = pgTable(
  'billing_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Null only for system rows (reconciliation heartbeat and remediation
    // filing). Per-user billing changes still require a user id.
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
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
    userIdRequiredUnlessSystem: check(
      'billing_audit_log_user_id_check',
      drizzleSql`${table.userId} IS NOT NULL OR ${table.eventType} IN ('reconciliation_run', 'billing_sync_remediation_filed')`
    ),
    userIdIdx: index('billing_audit_log_user_id_idx').on(table.userId),
    stripeEventIdIdx: index('billing_audit_log_stripe_event_id_idx').on(
      table.stripeEventId
    ),
    createdAtIdx: index('billing_audit_log_created_at_idx').on(table.createdAt),
  })
);

/**
 * Price lock (Tim, 2026-10-29): the price a person signed up at, recorded once
 * and honored on every surface and in checkout. One lock per user, written at
 * provisioning (signup), at waitlist join, or on first need. Amounts and
 * Stripe price ids are snapshots, so a later list-price change or a retired
 * price cannot change what this person pays. Rows are only ever updated to
 * record a reconcile verdict.
 */
export const priceLocks = pgTable(
  'price_locks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull(),
    priceVersionId: text('price_version_id').notNull(),
    currency: text('currency').notNull().default('usd'),
    monthlyAmountCents: integer('monthly_amount_cents'),
    yearlyAmountCents: integer('yearly_amount_cents'),
    stripePriceIdMonthly: text('stripe_price_id_monthly'),
    stripePriceIdYearly: text('stripe_price_id_yearly'),
    // signup | waitlist | checkout | first_view | backfill_subscription
    source: text('source').notNull(),
    lockedAt: timestamp('locked_at').defaultNow().notNull(),
    reconcileStatus: text('reconcile_status'),
    reconciledAt: timestamp('reconciled_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    amountsPositive: check(
      'price_locks_amounts_check',
      drizzleSql`(${table.monthlyAmountCents} IS NOT NULL OR ${table.yearlyAmountCents} IS NOT NULL) AND (${table.monthlyAmountCents} IS NULL OR ${table.monthlyAmountCents} > 0) AND (${table.yearlyAmountCents} IS NULL OR ${table.yearlyAmountCents} > 0)`
    ),
    userUnique: uniqueIndex('price_locks_user_id_unique').on(table.userId),
    versionIdx: index('price_locks_price_version_idx').on(table.priceVersionId),
  })
);

// Schema validations
export const insertStripeWebhookEventSchema =
  createInsertSchema(stripeWebhookEvents);
export const selectStripeWebhookEventSchema =
  createSelectSchema(stripeWebhookEvents);

export const insertBillingAuditLogSchema = createInsertSchema(billingAuditLog);
export const selectBillingAuditLogSchema = createSelectSchema(billingAuditLog);

// Types
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

export type PriceLockRow = typeof priceLocks.$inferSelect;
export type NewPriceLockRow = typeof priceLocks.$inferInsert;

export type BillingAuditLog = typeof billingAuditLog.$inferSelect;
export type NewBillingAuditLog = typeof billingAuditLog.$inferInsert;
