import { sql as drizzleSql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
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
  tipStatusEnum,
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
    // Summary columns for fast list views (avoids JSONB expansion)
    latestReferrerUrl: text('latest_referrer_url'),
    latestActionLabel: text('latest_action_label'),
    email: text('email'),
    phone: text('phone'),
    spotifyConnected: boolean('spotify_connected').default(false).notNull(),
    purchaseCount: integer('purchase_count').default(0).notNull(),
    tags: jsonb('tags').$type<string[]>().default([]),
    utmParams: jsonb('utm_params')
      .$type<{
        source?: string;
        medium?: string;
        campaign?: string;
        content?: string;
        term?: string;
      }>()
      .default({}),
    fingerprint: text('fingerprint'),
    attributionSource: text('attribution_source'),
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
    creatorProfileTypeLastSeenIdx: index(
      'audience_members_creator_profile_id_type_last_seen_at_idx'
    ).on(table.creatorProfileId, table.type, table.lastSeenAt),
    creatorProfileUpdatedIdx: index(
      'audience_members_creator_profile_id_updated_at_idx'
    ).on(table.creatorProfileId, table.updatedAt),
    retentionIdx: index('audience_members_retention_idx')
      .on(table.lastSeenAt)
      .where(
        drizzleSql`type = 'anonymous' AND email IS NULL AND phone IS NULL`
      ),
    // Performance indexes for dashboard analytics subquery optimization (JOV-520)
    fingerprintLookupIdx: index('idx_audience_members_fingerprint')
      .on(table.creatorProfileId, table.fingerprint)
      .where(drizzleSql`fingerprint IS NOT NULL`),
    emailLookupIdx: index('idx_audience_members_email')
      .on(table.creatorProfileId, table.email)
      .where(drizzleSql`email IS NOT NULL`),
  })
);

// Normalized audience referrer history (replaces JSONB referrer_history)
export const audienceReferrers = pgTable(
  'audience_referrers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    audienceMemberId: uuid('audience_member_id')
      .notNull()
      .references(() => audienceMembers.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    source: text('source'),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    memberTimestampIdx: index('audience_referrers_member_ts_idx').on(
      table.audienceMemberId,
      table.timestamp
    ),
  })
);

// Normalized audience action history (replaces JSONB latest_actions)
export const audienceActions = pgTable(
  'audience_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'cascade' }
    ),
    audienceMemberId: uuid('audience_member_id')
      .notNull()
      .references(() => audienceMembers.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    emoji: text('emoji'),
    platform: text('platform'),
    eventType: text('event_type').default('legacy').notNull(),
    verb: text('verb'),
    confidence: text('confidence').default('observed').notNull(),
    sourceKind: text('source_kind'),
    sourceLabel: text('source_label'),
    sourceLinkId: uuid('source_link_id').references(
      (): AnyPgColumn => audienceSourceLinks.id,
      { onDelete: 'set null' }
    ),
    objectType: text('object_type'),
    objectId: text('object_id'),
    objectLabel: text('object_label'),
    clickEventId: uuid('click_event_id').references(
      (): AnyPgColumn => clickEvents.id,
      {
        onDelete: 'set null',
      }
    ),
    properties: jsonb('properties')
      .$type<Record<string, unknown>>()
      .default({}),
    context: jsonb('context').$type<Record<string, unknown>>().default({}),
    // Intentionally nullable with no default — action timestamps come from
    // external event sources and may be backdated by the caller.
    timestamp: timestamp('timestamp', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    creatorProfileTimestampIdx: index(
      'audience_actions_creator_profile_id_timestamp_idx'
    ).on(table.creatorProfileId, table.timestamp),
    memberTimestampIdx: index('audience_actions_member_ts_idx').on(
      table.audienceMemberId,
      table.timestamp
    ),
    sourceLinkTimestampIdx: index(
      'audience_actions_source_link_id_timestamp_idx'
    ).on(table.sourceLinkId, table.timestamp),
    eventTypeTimestampIdx: index(
      'audience_actions_event_type_timestamp_idx'
    ).on(table.eventType, table.timestamp),
  })
);

// Creator-facing source/campaign buckets for trackable links and QR codes.
export const audienceSourceGroups = pgTable(
  'audience_source_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sourceType: text('source_type').default('qr').notNull(),
    destinationKind: text('destination_kind').default('profile').notNull(),
    destinationId: text('destination_id'),
    destinationUrl: text('destination_url'),
    utmParams: jsonb('utm_params')
      .$type<Record<string, string | undefined>>()
      .default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileCreatedAtIdx: index(
      'audience_source_groups_creator_profile_id_created_at_idx'
    ).on(table.creatorProfileId, table.createdAt),
    creatorProfileSourceTypeIdx: index(
      'audience_source_groups_creator_profile_id_source_type_idx'
    ).on(table.creatorProfileId, table.sourceType),
  })
);

// Individual trackable short links/QR code destinations.
export const audienceSourceLinks = pgTable(
  'audience_source_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    sourceGroupId: uuid('source_group_id').references(
      () => audienceSourceGroups.id,
      { onDelete: 'cascade' }
    ),
    code: text('code').notNull(),
    name: text('name').notNull(),
    sourceType: text('source_type').default('qr').notNull(),
    destinationKind: text('destination_kind').default('profile').notNull(),
    destinationId: text('destination_id'),
    destinationUrl: text('destination_url').notNull(),
    utmParams: jsonb('utm_params')
      .$type<Record<string, string | undefined>>()
      .default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    scanCount: integer('scan_count').default(0).notNull(),
    lastScannedAt: timestamp('last_scanned_at'),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    codeUnique: uniqueIndex('audience_source_links_code_unique').on(table.code),
    creatorProfileGroupIdx: index(
      'audience_source_links_creator_profile_id_source_group_id_idx'
    ).on(table.creatorProfileId, table.sourceGroupId),
    creatorProfileSourceTypeIdx: index(
      'audience_source_links_creator_profile_id_source_type_idx'
    ).on(table.creatorProfileId, table.sourceType),
    creatorProfileLastScannedIdx: index(
      'audience_source_links_creator_profile_id_last_scanned_at_idx'
    ).on(table.creatorProfileId, table.lastScannedAt),
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
    isBot: boolean('is_bot').notNull().default(false),
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
    linkIdIdx: index('idx_click_events_link_id').on(table.linkId),
    audienceMemberIdIdx: index('idx_click_events_audience_member_id').on(
      table.audienceMemberId
    ),

    linkTypeAnalyticsIndex: index('idx_click_events_link_type').on(
      table.creatorProfileId,
      table.linkType,
      table.createdAt
    ),
    // Performance index: non-bot clicks for dashboard analytics (JOV-520)
    nonBotClicksIdx: index('idx_click_events_non_bot')
      .on(table.creatorProfileId, table.createdAt)
      .where(drizzleSql`is_bot = false`),
    // Partial index for release analytics queries filtering on metadata contentId
    metadataContentIdx: index('idx_click_events_metadata_content')
      .on(table.creatorProfileId, table.createdAt)
      .where(drizzleSql`metadata->>'contentId' IS NOT NULL`),
  })
);

export const dailyProfileViews = pgTable(
  'daily_profile_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    viewDate: date('view_date', { mode: 'string' }).notNull(),
    viewCount: integer('view_count').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileViewDateUnique: uniqueIndex(
      'daily_profile_views_creator_profile_id_view_date_unique'
    ).on(table.creatorProfileId, table.viewDate),
    creatorProfileViewDateIdx: index(
      'daily_profile_views_creator_profile_id_view_date_idx'
    ).on(table.creatorProfileId, table.viewDate),
  })
);

/**
 * Content categories fans can subscribe to for notifications.
 * These control *what* the fan hears about (orthogonal to *how* — email/sms).
 */
export type FanNotificationContentType =
  | 'newMusic'
  | 'tourDates'
  | 'merch'
  | 'general'
  | 'promo';

/** All available content types, ordered for UI display. */
export const FAN_NOTIFICATION_CONTENT_TYPES: readonly {
  key: FanNotificationContentType;
  label: string;
  description: string;
}[] = [
  {
    key: 'newMusic',
    label: 'New Music',
    description: 'New releases, singles & albums',
  },
  {
    key: 'tourDates',
    label: 'Tour Dates',
    description: 'Shows, tours & live events',
  },
  { key: 'merch', label: 'Merch', description: 'Drops, restocks & exclusives' },
  {
    key: 'general',
    label: 'General Updates',
    description: 'Announcements & other news',
  },
  {
    key: 'promo',
    label: 'Promos',
    description: 'Downloads, stems & DJ promos',
  },
] as const;

/**
 * Fan notification preferences for release alerts and content categories.
 *
 * Legacy fields (releasePreview, releaseDay) are preserved for backwards
 * compatibility. New content category fields default to true on subscribe.
 */
export interface FanNotificationPreferences {
  releasePreview?: boolean;
  releaseDay?: boolean;
  /** Opt-in to new music release alerts */
  newMusic?: boolean;
  /** Opt-in to tour date / live event alerts */
  tourDates?: boolean;
  /** Opt-in to merch drop alerts */
  merch?: boolean;
  /** Opt-in to general announcements */
  general?: boolean;
  /** Opt-in to promo downloads, stems & DJ promos */
  promo?: boolean;
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
    name: text('name'),
    birthday: text('birthday'), // "YYYY-MM-DD" (ISO date); legacy: "MM-DD"
    // Fan notification preferences for granular control
    preferences: jsonb('preferences')
      .$type<FanNotificationPreferences>()
      .default({
        releasePreview: true,
        releaseDay: true,
        newMusic: true,
        tourDates: true,
        merch: true,
        general: true,
      }),
    // Double opt-in: null = unconfirmed (pending), non-null = confirmed
    confirmedAt: timestamp('confirmed_at'),
    // HMAC token hash for email verification link
    confirmationToken: text('confirmation_token'),
    confirmationSentAt: timestamp('confirmation_sent_at'),
    emailOtpHash: text('email_otp_hash'),
    emailOtpExpiresAt: timestamp('email_otp_expires_at'),
    emailOtpLastSentAt: timestamp('email_otp_last_sent_at'),
    emailOtpAttempts: integer('email_otp_attempts').notNull().default(0),
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
      drizzleSql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`
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
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    tipperName: text('tipper_name'),
    message: text('message'),
    isAnonymous: boolean('is_anonymous').default(false),
    status: tipStatusEnum('status').default('pending').notNull(),
    platformFeeCents: integer('platform_fee_cents'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
    // Covering index: earnings aggregation queries that filter by completed status
    // Allows index-only scans for SUM(amount_cents) grouped by creator_profile_id
    statusAmountIdx: index('idx_tips_status_amount').on(
      table.creatorProfileId,
      table.status,
      table.createdAt
    ),
    checkoutSessionIdx: uniqueIndex(
      'tips_stripe_checkout_session_id_unique'
    ).on(table.stripeCheckoutSessionId),
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

export type AudienceAction = typeof audienceActions.$inferSelect;
export type NewAudienceAction = typeof audienceActions.$inferInsert;

export type AudienceSourceGroup = typeof audienceSourceGroups.$inferSelect;
export type NewAudienceSourceGroup = typeof audienceSourceGroups.$inferInsert;

export type AudienceSourceLink = typeof audienceSourceLinks.$inferSelect;
export type NewAudienceSourceLink = typeof audienceSourceLinks.$inferInsert;

export type ClickEvent = typeof clickEvents.$inferSelect;
export type NewClickEvent = typeof clickEvents.$inferInsert;

export type DailyProfileView = typeof dailyProfileViews.$inferSelect;
export type NewDailyProfileView = typeof dailyProfileViews.$inferInsert;

export type NotificationSubscription =
  typeof notificationSubscriptions.$inferSelect;
export type NewNotificationSubscription =
  typeof notificationSubscriptions.$inferInsert;

export type Tip = typeof tips.$inferSelect;
export type NewTip = typeof tips.$inferInsert;

// Audience blocks table — creators can block individual audience members
// from viewing their public profile. Blocked visitors are silently redirected.
export const audienceBlocks = pgTable(
  'audience_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    audienceMemberId: uuid('audience_member_id').references(
      () => audienceMembers.id,
      { onDelete: 'set null' }
    ),
    fingerprint: text('fingerprint').notNull(),
    email: text('email'), // stored lowercase for case-insensitive matching
    displayName: text('display_name'), // snapshotted at block time
    geoCity: text('geo_city'), // snapshotted at block time
    geoCountry: text('geo_country'), // snapshotted at block time
    reason: text('reason'),
    blockedAt: timestamp('blocked_at').defaultNow().notNull(),
    unblockedAt: timestamp('unblocked_at'),
  },
  table => [
    uniqueIndex('audience_blocks_profile_fingerprint_active')
      .on(table.creatorProfileId, table.fingerprint)
      .where(drizzleSql`unblocked_at IS NULL`),
    index('idx_audience_blocks_profile_email_active')
      .on(table.creatorProfileId, table.email)
      .where(drizzleSql`email IS NOT NULL AND unblocked_at IS NULL`),
  ]
);

export const insertAudienceBlockSchema = createInsertSchema(audienceBlocks);
export const selectAudienceBlockSchema = createSelectSchema(audienceBlocks);

export type AudienceBlock = typeof audienceBlocks.$inferSelect;
export type NewAudienceBlock = typeof audienceBlocks.$inferInsert;
