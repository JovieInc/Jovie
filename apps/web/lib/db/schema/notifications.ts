import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { audienceMembers } from './analytics';
import { creatorProfiles } from './profiles';

/**
 * Cross-artist global state for a fan contact (phone or email).
 * Holds first-write-wins SMS consent and global suppression status.
 *
 * Per-artist consent and subscription state lives on `notification_subscriptions`,
 * not here. This table is intentionally scoped to global signals so concurrent
 * multi-artist JOIN webhooks don't overwrite each other's consent ledgers.
 */
export const notificationContacts = pgTable(
  'notification_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone'),
    phoneHash: text('phone_hash'),
    email: text('email'),
    emailHash: text('email_hash'),
    phoneVerifiedAt: timestamp('phone_verified_at'),
    emailVerifiedAt: timestamp('email_verified_at'),
    smsConsentAt: timestamp('sms_consent_at'),
    smsConsentTextHash: text('sms_consent_text_hash'),
    smsConsentVersion: text('sms_consent_version'),
    // 'active' | 'stopped' | 'blocked'
    smsStatus: text('sms_status').default('active').notNull(),
    firstSource: text('first_source'),
    firstSourceUrl: text('first_source_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    phoneHashUnique: uniqueIndex('notification_contacts_phone_hash_unique')
      .on(table.phoneHash)
      .where(drizzleSql`${table.phoneHash} IS NOT NULL`),
    emailHashUnique: uniqueIndex('notification_contacts_email_hash_unique')
      .on(table.emailHash)
      .where(drizzleSql`${table.emailHash} IS NOT NULL`),
    smsStatusIdx: index('notification_contacts_sms_status_idx').on(
      table.smsStatus
    ),
    smsStatusValid: check(
      'notification_contacts_sms_status_valid',
      drizzleSql`${table.smsStatus} IN ('active', 'stopped', 'blocked')`
    ),
  })
);

/**
 * Short-lived SMS subscribe intent. Created on artist-profile CTA click,
 * consumed by inbound provider webhook on JOIN. One-time-use.
 *
 * Codes are 8 chars from alphabet [A-Z 2-9] excluding I O 0 1 to avoid
 * iOS autocorrect / visual ambiguity. Only `codeHash` is persisted; the
 * plaintext `codeDisplay` is returned to the client and never re-derivable
 * from the row alone (hashing uses `SMS_INTENT_SECRET`).
 */
export const smsSubscribeIntents = pgTable(
  'sms_subscribe_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id'),
    audienceMemberId: uuid('audience_member_id').references(
      () => audienceMembers.id,
      { onDelete: 'set null' }
    ),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    countryCode: text('country_code'),
    consentTextHash: text('consent_text_hash').notNull(),
    consentVersion: text('consent_version').notNull(),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
    fingerprintHash: text('fingerprint_hash'),
    // 'created' | 'sms_received' | 'confirmed' | 'expired' | 'consumed' | 'blocked'
    status: text('status').default('created').notNull(),
    phone: text('phone'),
    provider: text('provider'),
    providerMessageId: text('provider_message_id'),
    completedAt: timestamp('completed_at'),
    expiresAt: timestamp('expires_at').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    codeHashUnique: uniqueIndex('sms_subscribe_intents_code_hash_unique').on(
      table.codeHash
    ),
    creatorProfileCreatedAtIdx: index(
      'sms_subscribe_intents_creator_profile_id_created_at_idx'
    ).on(table.creatorProfileId, table.createdAt),
    statusExpiresAtIdx: index('sms_subscribe_intents_status_expires_at_idx').on(
      table.status,
      table.expiresAt
    ),
    activeIdx: index('sms_subscribe_intents_active_idx')
      .on(table.expiresAt)
      .where(drizzleSql`${table.status} IN ('created', 'sms_received')`),
    visitorIdIdx: index('sms_subscribe_intents_visitor_id_idx')
      .on(table.visitorId)
      .where(drizzleSql`${table.visitorId} IS NOT NULL`),
    statusValid: check(
      'sms_subscribe_intents_status_valid',
      drizzleSql`${table.status} IN ('created', 'sms_received', 'confirmed', 'expired', 'consumed', 'blocked')`
    ),
  })
);

export const insertNotificationContactSchema =
  createInsertSchema(notificationContacts);
export const selectNotificationContactSchema =
  createSelectSchema(notificationContacts);

export const insertSmsSubscribeIntentSchema =
  createInsertSchema(smsSubscribeIntents);
export const selectSmsSubscribeIntentSchema =
  createSelectSchema(smsSubscribeIntents);

export type NotificationContact = typeof notificationContacts.$inferSelect;
export type NewNotificationContact = typeof notificationContacts.$inferInsert;

export type SmsSubscribeIntent = typeof smsSubscribeIntents.$inferSelect;
export type NewSmsSubscribeIntent = typeof smsSubscribeIntents.$inferInsert;

export type SmsContactStatus = 'active' | 'stopped' | 'blocked';

export type SmsIntentStatus =
  | 'created'
  | 'sms_received'
  | 'confirmed'
  | 'expired'
  | 'consumed'
  | 'blocked';
