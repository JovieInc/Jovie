import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * State mirror of the in-code price-change registry
 * (lib/billing/price-changes/registry.ts). The registry is the declaration;
 * this row carries the runtime state: who was counted, when everyone was
 * notified, whether the switch is held, and when it was applied.
 */
export const scheduledPriceChanges = pgTable(
  'scheduled_price_changes',
  {
    id: text('id').primaryKey(),
    priceKey: text('price_key').notNull(),
    planName: text('plan_name').notNull(),
    oldAmountCents: integer('old_amount_cents').notNull(),
    newAmountCents: integer('new_amount_cents').notNull(),
    effectiveAt: timestamp('effective_at').notNull(),
    scheduledAt: timestamp('scheduled_at').notNull(),
    registeredAt: timestamp('registered_at').defaultNow().notNull(),
    status: text('status').notNull().default('scheduled'),
    affectedCount: integer('affected_count').notNull().default(0),
    fullyNotifiedAt: timestamp('fully_notified_at'),
    heldAt: timestamp('held_at'),
    incidentFiledAt: timestamp('incident_filed_at'),
    appliedAt: timestamp('applied_at'),
    lastSweepAt: timestamp('last_sweep_at'),
  },
  table => ({
    statusCheck: check(
      'scheduled_price_changes_status_check',
      drizzleSql`${table.status} IN ('scheduled', 'notifying', 'fully_notified', 'held', 'applied', 'cancelled')`
    ),
  })
);

/** One notice per (change, Stripe subscription). The unique index is the idempotency anchor. */
export const priceChangeNotices = pgTable(
  'price_change_notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    changeId: text('change_id')
      .notNull()
      .references(() => scheduledPriceChanges.id, { onDelete: 'restrict' }),
    subscriptionId: text('subscription_id').notNull(),
    customerId: text('customer_id').notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    bounceRetries: integer('bounce_retries').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at'),
    providerMessageId: text('provider_message_id'),
    contentHash: text('content_hash'),
    templateVersion: text('template_version'),
    queuedAt: timestamp('queued_at').defaultNow().notNull(),
    claimedAt: timestamp('claimed_at'),
    sentAt: timestamp('sent_at'),
    lastError: text('last_error'),
    fallbackNoticeAt: timestamp('fallback_notice_at'),
    appliedAt: timestamp('applied_at'),
    appliedStripePriceId: text('applied_stripe_price_id'),
    applyError: text('apply_error'),
  },
  table => ({
    changeSubscriptionUnique: uniqueIndex(
      'price_change_notices_change_subscription_idx'
    ).on(table.changeId, table.subscriptionId),
    statusIdx: index('price_change_notices_status_idx').on(
      table.status,
      table.nextAttemptAt
    ),
    providerMessageIdx: index('price_change_notices_provider_message_idx').on(
      table.providerMessageId
    ),
    statusCheck: check(
      'price_change_notices_status_check',
      drizzleSql`${table.status} IN ('queued', 'sending', 'sent', 'bounced', 'failed', 'permanent_bounce', 'no_recipient')`
    ),
  })
);

export type ScheduledPriceChangeRow = typeof scheduledPriceChanges.$inferSelect;
export type PriceChangeNoticeRow = typeof priceChangeNotices.$inferSelect;
