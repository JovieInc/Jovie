import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { creatorProfiles } from './creators';

/**
 * Notifications domain schema.
 * Fan notification subscriptions for email/SMS/push updates.
 * Depends on: creators (for foreign key references)
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Notification delivery channel type.
 */
export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'sms',
  'push',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Notification subscriptions - fan opt-ins for creator updates.
 * Tracks email/SMS/push notification preferences per creator.
 */
export const notificationSubscriptions = pgTable(
  'notification_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull(),
    email: text('email'),
    phone: text('phone'),
    countryCode: text('country_code'),
    city: text('city'),
    ipAddress: text('ip_address'),
    source: text('source'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileEmailUnique: uniqueIndex(
      'notification_subscriptions_creator_profile_id_email_unique'
    ).on(table.creatorProfileId, table.email),
    creatorProfilePhoneUnique: uniqueIndex(
      'notification_subscriptions_creator_profile_id_phone_unique'
    ).on(table.creatorProfileId, table.phone),
  })
);
