/**
 * Product Update Subscribers Schema
 *
 * Stores email subscriptions for changelog/product update notifications.
 * Used for non-Jovie-users (investors, prospective customers) who subscribe
 * via the /changelog page. Jovie users use the productUpdates preference
 * in their notification settings instead.
 */

import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

export const productUpdateSubscribers = pgTable(
  'product_update_subscribers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    verified: boolean('verified').default(false).notNull(),
    verificationToken: uuid('verification_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    unsubscribeToken: uuid('unsubscribe_token').defaultRandom().notNull(),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    source: text('source').default('changelog_page').notNull(),
    lastProductUpdateAt: timestamp('last_product_update_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [uniqueIndex('product_update_subscribers_email_idx').on(table.email)]
);

export type ProductUpdateSubscriber =
  typeof productUpdateSubscribers.$inferSelect;
export type NewProductUpdateSubscriber =
  typeof productUpdateSubscribers.$inferInsert;

export const insertProductUpdateSubscriberSchema = createInsertSchema(
  productUpdateSubscribers
);
export const selectProductUpdateSubscriberSchema = createSelectSchema(
  productUpdateSubscribers
);
