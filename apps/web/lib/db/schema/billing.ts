import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
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
    stripeCreatedAt: timestamp('stripe_created_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    createdAtIdx: index('stripe_webhook_events_created_at_idx').on(
      table.createdAt
    ),
  })
);

// Billing audit log for tracking subscription state changes
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

export type BillingAuditLog = typeof billingAuditLog.$inferSelect;
export type NewBillingAuditLog = typeof billingAuditLog.$inferInsert;
