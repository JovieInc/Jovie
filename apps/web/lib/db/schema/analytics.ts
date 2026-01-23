import { sql } from 'drizzle-orm';
import {
  boolean,
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
import {
  audienceDeviceTypeEnum,
  audienceIntentLevelEnum,
  audienceMemberTypeEnum,
  currencyCodeEnum,
  linkTypeEnum,
  notificationChannelEnum,
} from './enums';
import { socialLinks } from './links';
import { creatorProfiles } from './profiles';

// Audience members table
export const audienceMembers = pgTable(
  'audience_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    type: audienceMemberTypeEnum('type').default('anonymous').notNull(),
    displayName: text('display_name'),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    visits: integer('visits').default(0).notNull(),
    engagementScore: integer('engagement_score').default(0).notNull(),
    intentLevel: audienceIntentLevelEnum('intent_level')
      .default('low')
      .notNull(),
    geoCity: text('geo_city'),
    geoCountry: text('geo_country'),
    deviceType: audienceDeviceTypeEnum('device_type')
      .default('unknown')
      .notNull(),
    referrerHistory: jsonb('referrer_history')
      .$type<Record<string, unknown>[]>()
      .default([]),
    latestActions: jsonb('latest_actions')
      .$type<Record<string, unknown>[]>()
      .default([]),
    email: text('email'),
    phone: text('phone'),
    spotifyConnected: boolean('spotify_connected').default(false).notNull(),
    purchaseCount: integer('purchase_count').default(0).notNull(),
    tags: jsonb('tags').$type<string[]>().default([]),
    fingerprint: text('fingerprint'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileFingerprintUnique: uniqueIndex(
      'audience_members_creator_profile_id_fingerprint_unique'
    ).on(table.creatorProfileId, table.fingerprint),
    creatorProfileLastSeenIdx: index(
      'audience_members_creator_profile_id_last_seen_at_idx'
    ).on(table.creatorProfileId, table.lastSeenAt),
    creatorProfileUpdatedIdx: index(
      'audience_members_creator_profile_id_updated_at_idx'
    ).on(table.creatorProfileId, table.updatedAt),
    retentionIdx: index('audience_members_retention_idx')
      .on(table.lastSeenAt)
      .where(sql`type = 'anonymous' AND email IS NULL AND phone IS NULL`),
  })
);

// Click events table
export const clickEvents = pgTable(
  'click_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    linkId: uuid('link_id').references(() => socialLinks.id, {
      onDelete: 'set null',
    }),
    linkType: linkTypeEnum('link_type').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    referrer: text('referrer'),
    country: text('country'),
    city: text('city'),
    deviceType: text('device_type'),
    os: text('os'),
    browser: text('browser'),
    isBot: boolean('is_bot').default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    audienceMemberId: uuid('audience_member_id').references(
      () => audienceMembers.id,
      {
        onDelete: 'set null',
      }
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileCreatedAtIdx: index(
      'click_events_creator_profile_id_created_at_idx'
    ).on(table.creatorProfileId, table.createdAt),
    creatorProfileIsBotCreatedAtIdx: index(
      'click_events_creator_profile_id_is_bot_created_at_idx'
    ).on(table.creatorProfileId, table.isBot, table.createdAt),
    createdAtIdx: index('click_events_created_at_idx').on(table.createdAt),
    // Performance index: analytics aggregation by link type
    linkTypeAnalyticsIndex: index('idx_click_events_link_type').on(
      table.creatorProfileId,
      table.linkType,
      table.createdAt
    ),
  })
);

/**
 * Fan notification preferences for release alerts
 */
export interface FanNotificationPreferences {
  releasePreview?: boolean;
  releaseDay?: boolean;
}

// Notification subscriptions table
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
    // Fan notification preferences for granular control
    preferences: jsonb('preferences')
      .$type<FanNotificationPreferences>()
      .default({
        releasePreview: true,
        releaseDay: true,
      }),
    unsubscribedAt: timestamp('unsubscribed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileEmailUnique: uniqueIndex(
      'notification_subscriptions_creator_profile_id_email_unique'
    ).on(table.creatorProfileId, table.email),
    creatorProfilePhoneUnique: uniqueIndex(
      'notification_subscriptions_creator_profile_id_phone_unique'
    ).on(table.creatorProfileId, table.phone),
    contactRequired: check(
      'notification_subscriptions_contact_required',
      sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`
    ),
    creatorProfileCreatedAtIdx: index(
      'notification_subscriptions_creator_profile_id_created_at_idx'
    ).on(table.creatorProfileId, table.createdAt),
    createdAtIdx: index('notification_subscriptions_created_at_idx').on(
      table.createdAt
    ),
  })
);

// Tips table
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
    creatorProfileIdx: index('tips_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    // Performance index: monthly tipping stats queries
    createdAtIndex: index('idx_tips_created_at').on(
      table.creatorProfileId,
      table.createdAt
    ),
  })
);

// Schema validations
export const insertClickEventSchema = createInsertSchema(clickEvents);
export const selectClickEventSchema = createSelectSchema(clickEvents);

export const insertNotificationSubscriptionSchema = createInsertSchema(
  notificationSubscriptions
);
export const selectNotificationSubscriptionSchema = createSelectSchema(
  notificationSubscriptions
);

export const insertTipSchema = createInsertSchema(tips);
export const selectTipSchema = createSelectSchema(tips);

// Types
export type AudienceMember = typeof audienceMembers.$inferSelect;
export type NewAudienceMember = typeof audienceMembers.$inferInsert;

export type ClickEvent = typeof clickEvents.$inferSelect;
export type NewClickEvent = typeof clickEvents.$inferInsert;

export type NotificationSubscription =
  typeof notificationSubscriptions.$inferSelect;
export type NewNotificationSubscription =
  typeof notificationSubscriptions.$inferInsert;

export type Tip = typeof tips.$inferSelect;
export type NewTip = typeof tips.$inferInsert;
