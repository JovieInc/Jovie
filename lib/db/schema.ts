import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

// Enums
export const creatorTypeEnum = pgEnum('creator_type', [
  'artist',
  'podcaster',
  'influencer',
  'creator',
]);
export const linkTypeEnum = pgEnum('link_type', [
  'listen',
  'social',
  'tip',
  'other',
]);
export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'free',
  'basic',
  'premium',
  'pro',
]);
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

export const ingestionStatusEnum = pgEnum('ingestion_status', [
  'idle',
  'pending',
  'processing',
  'failed',
]);

export const ingestionSourceTypeEnum = pgEnum('ingestion_source_type', [
  'manual',
  'admin',
  'ingested',
]);

export const providerKindEnum = pgEnum('provider_kind', [
  'music_streaming',
  'video',
  'social',
  'retail',
  'other',
]);

export const discogReleaseTypeEnum = pgEnum('discog_release_type', [
  'single',
  'ep',
  'album',
  'compilation',
  'live',
  'mixtape',
  'other',
]);

export const providerLinkOwnerEnum = pgEnum('provider_link_owner_type', [
  'release',
  'track',
]);

export const socialLinkStateEnum = pgEnum('social_link_state', [
  'active',
  'suggested',
  'rejected',
]);

export const socialAccountStatusEnum = pgEnum('social_account_status', [
  'suspected',
  'confirmed',
  'rejected',
]);

export const contactRoleEnum = pgEnum('contact_role', [
  'bookings',
  'management',
  'press_pr',
  'brand_partnerships',
  'fan_general',
  'other',
]);

export const contactChannelEnum = pgEnum('contact_channel', ['email', 'phone']);

export const ingestionJobStatusEnum = pgEnum('ingestion_job_status', [
  'pending',
  'processing',
  'succeeded',
  'failed',
]);

export const scraperStrategyEnum = pgEnum('scraper_strategy', [
  'http',
  'browser',
  'api',
]);

export const waitlistStatusEnum = pgEnum('waitlist_status', [
  'new',
  'invited',
  'claimed',
  'rejected',
]);

export const waitlistInviteStatusEnum = pgEnum('waitlist_invite_status', [
  'pending',
  'sending',
  'sent',
  'failed',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'sms',
  'push',
]);

export const audienceMemberTypeEnum = pgEnum('audience_member_type', [
  'anonymous',
  'email',
  'sms',
  'spotify',
  'customer',
]);

export const audienceDeviceTypeEnum = pgEnum('audience_device_type', [
  'mobile',
  'desktop',
  'tablet',
  'unknown',
]);

export const audienceIntentLevelEnum = pgEnum('audience_intent_level', [
  'high',
  'medium',
  'low',
]);

// Theme preference enum for users
export const themeModeEnum = pgEnum('theme_mode', ['system', 'light', 'dark']);

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

// Profile photos enum for upload status
export const photoStatusEnum = pgEnum('photo_status', [
  'uploading',
  'processing',
  'ready',
  'failed',
]);

// Tables
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

// Per-user settings (separate from creator profile)
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  themeMode: themeModeEnum('theme_mode').notNull().default('system'),
  sidebarCollapsed: boolean('sidebar_collapsed').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const providers = pgTable('providers', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  kind: providerKindEnum('kind').notNull().default('music_streaming'),
  baseUrl: text('base_url'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    creatorType: creatorTypeEnum('creator_type').notNull(),
    username: text('username').notNull(),
    usernameNormalized: text('username_normalized').notNull(),
    displayName: text('display_name'),
    bio: text('bio'),
    venmoHandle: text('venmo_handle'),
    avatarUrl: text('avatar_url'),
    spotifyUrl: text('spotify_url'),
    appleMusicUrl: text('apple_music_url'),
    youtubeUrl: text('youtube_url'),
    spotifyId: text('spotify_id'),
    isPublic: boolean('is_public').default(true),
    isVerified: boolean('is_verified').default(false),
    isFeatured: boolean('is_featured').default(false),
    marketingOptOut: boolean('marketing_opt_out').default(false),
    isClaimed: boolean('is_claimed').default(false),
    claimToken: text('claim_token'),
    claimedAt: timestamp('claimed_at'),
    claimTokenExpiresAt: timestamp('claim_token_expires_at'),
    claimedFromIp: text('claimed_from_ip'),
    claimedUserAgent: text('claimed_user_agent'),
    avatarLockedByUser: boolean('avatar_locked_by_user')
      .default(false)
      .notNull(),
    displayNameLocked: boolean('display_name_locked').default(false).notNull(),
    ingestionStatus: ingestionStatusEnum('ingestion_status')
      .default('idle')
      .notNull(),
    lastIngestionError: text('last_ingestion_error'),
    lastLoginAt: timestamp('last_login_at'),
    profileViews: integer('profile_views').default(0),
    onboardingCompletedAt: timestamp('onboarding_completed_at'),
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
    theme: jsonb('theme').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    featuredCreatorsQueryIndex: index('idx_creator_profiles_featured_with_name')
      .on(
        table.isPublic,
        table.isFeatured,
        table.marketingOptOut,
        table.displayName
      )
      .where(
        drizzleSql`is_public = true AND is_featured = true AND marketing_opt_out = false`
      ),
    // CRITICAL: Unique constraint added in migration 0025 to prevent race conditions
    // during onboarding where two users could claim the same handle simultaneously
    usernameNormalizedUnique: uniqueIndex('creator_profiles_username_normalized_unique')
      .on(table.usernameNormalized)
      .where(drizzleSql`username_normalized IS NOT NULL`),
  })
);

export const discogReleases = pgTable(
  'discog_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    releaseType: discogReleaseTypeEnum('release_type')
      .notNull()
      .default('single'),
    releaseDate: timestamp('release_date'),
    label: text('label'),
    upc: text('upc'),
    totalTracks: integer('total_tracks').default(0).notNull(),
    isExplicit: boolean('is_explicit').default(false).notNull(),
    artworkUrl: text('artwork_url'),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorSlugUnique: uniqueIndex('discog_releases_creator_slug_unique').on(
      table.creatorProfileId,
      table.slug
    ),
    creatorUpcUnique: uniqueIndex('discog_releases_creator_upc_unique')
      .on(table.creatorProfileId, table.upc)
      .where(drizzleSql`upc IS NOT NULL`),
    releaseDateIndex: index('discog_releases_release_date_idx').on(
      table.releaseDate
    ),
  })
);

export const discogTracks = pgTable(
  'discog_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    durationMs: integer('duration_ms'),
    trackNumber: integer('track_number').notNull(),
    discNumber: integer('disc_number').default(1).notNull(),
    isExplicit: boolean('is_explicit').default(false).notNull(),
    isrc: text('isrc'),
    previewUrl: text('preview_url'),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseTrackPositionUnique: uniqueIndex(
      'discog_tracks_release_track_position_unique'
    ).on(table.releaseId, table.discNumber, table.trackNumber),
    releaseSlugUnique: uniqueIndex('discog_tracks_release_slug_unique').on(
      table.releaseId,
      table.slug
    ),
    trackIsrcUnique: uniqueIndex('discog_tracks_isrc_unique')
      .on(table.isrc)
      .where(drizzleSql`isrc IS NOT NULL`),
    releaseIndex: index('discog_tracks_release_id_idx').on(table.releaseId),
    creatorIndex: index('discog_tracks_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
  })
);

export const providerLinks = pgTable(
  'provider_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),
    ownerType: providerLinkOwnerEnum('owner_type').notNull(),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    externalId: text('external_id'),
    url: text('url').notNull(),
    country: text('country'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseProviderUnique: uniqueIndex('provider_links_release_provider').on(
      table.providerId,
      table.releaseId
    ),
    trackProviderUnique: uniqueIndex('provider_links_track_provider').on(
      table.providerId,
      table.trackId
    ),
    providerExternalUnique: uniqueIndex('provider_links_provider_external')
      .on(table.providerId, table.externalId)
      .where(drizzleSql`external_id IS NOT NULL`),
    releaseIndex: index('provider_links_release_id_idx').on(table.releaseId),
    trackIndex: index('provider_links_track_id_idx').on(table.trackId),
    ownerConstraint: check(
      'provider_links_owner_match',
      drizzleSql`
        (owner_type = 'release' AND release_id IS NOT NULL AND track_id IS NULL)
        OR (owner_type = 'track' AND track_id IS NOT NULL AND release_id IS NULL)
      `
    ),
  })
);

export const smartLinkTargets = pgTable(
  'smart_link_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    smartLinkSlug: text('smart_link_slug').notNull(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),
    providerLinkId: uuid('provider_link_id').references(
      () => providerLinks.id,
      {
        onDelete: 'set null',
      }
    ),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    url: text('url').notNull(),
    isFallback: boolean('is_fallback').default(false).notNull(),
    priority: integer('priority').default(0).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    slugProviderUnique: uniqueIndex('smart_link_targets_slug_provider').on(
      table.creatorProfileId,
      table.smartLinkSlug,
      table.providerId
    ),
    providerLinkIndex: index('smart_link_targets_provider_link_idx').on(
      table.providerLinkId
    ),
    releaseIndex: index('smart_link_targets_release_id_idx').on(
      table.releaseId
    ),
    trackIndex: index('smart_link_targets_track_id_idx').on(table.trackId),
    ownerConstraint: check(
      'smart_link_targets_owner_match',
      drizzleSql`
        (release_id IS NOT NULL AND track_id IS NULL)
        OR (track_id IS NOT NULL AND release_id IS NULL)
      `
    ),
  })
);

export const socialLinks = pgTable('social_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorProfileId: uuid('creator_profile_id')
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  platformType: text('platform_type').notNull(),
  url: text('url').notNull(),
  displayText: text('display_text'),
  sortOrder: integer('sort_order').default(0),
  clicks: integer('clicks').default(0),
  isActive: boolean('is_active').default(true),
  state: socialLinkStateEnum('state').default('active').notNull(),
  confidence: numeric('confidence', { precision: 3, scale: 2 })
    .default('1.00')
    .notNull(),
  sourcePlatform: text('source_platform'),
  sourceType: ingestionSourceTypeEnum('source_type')
    .default('manual')
    .notNull(),
  evidence: jsonb('evidence')
    .$type<{ sources?: string[]; signals?: string[] }>()
    .default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorProfileId: uuid('creator_profile_id')
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  handle: text('handle'),
  url: text('url'),
  status: socialAccountStatusEnum('status').default('suspected').notNull(),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).default('0.00'),
  isVerifiedFlag: boolean('is_verified_flag').default(false),
  paidFlag: boolean('paid_flag').default(false),
  rawData: jsonb('raw_data').$type<Record<string, unknown>>().default({}),
  sourcePlatform: text('source_platform'),
  sourceType: ingestionSourceTypeEnum('source_type')
    .default('ingested')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
    // Composite index for visitor lookup on every profile visit
    // Query pattern: WHERE creator_profile_id = ? AND fingerprint = ?
    creatorProfileFingerprintIdx: index(
      'audience_members_creator_profile_id_fingerprint_idx'
    ).on(table.creatorProfileId, table.fingerprint),
    creatorProfileFingerprintUnique: uniqueIndex(
      'audience_members_creator_profile_id_fingerprint_unique'
    ).on(table.creatorProfileId, table.fingerprint),
  })
);

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
    // Composite index for analytics queries filtered by creator and sorted by time
    // Query pattern: WHERE creator_profile_id = ? ORDER BY created_at DESC
    creatorProfileCreatedAtIdx: index(
      'click_events_creator_profile_id_created_at_idx'
    ).on(table.creatorProfileId, table.createdAt),
  })
);

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

export const creatorContacts = pgTable('creator_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorProfileId: uuid('creator_profile_id')
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  role: contactRoleEnum('role').notNull(),
  customLabel: text('custom_label'),
  personName: text('person_name'),
  companyName: text('company_name'),
  territories: jsonb('territories').$type<string[]>().notNull().default([]),
  email: text('email'),
  phone: text('phone'),
  preferredChannel: contactChannelEnum('preferred_channel'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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

export const signedLinkAccess = pgTable('signed_link_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: text('link_id').notNull(),
  signedToken: text('signed_token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  isUsed: boolean('is_used').default(false),
  usedAt: timestamp('used_at'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const wrappedLinks = pgTable('wrapped_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortId: text('short_id').notNull().unique(),
  encryptedUrl: text('encrypted_url').notNull(),
  kind: text('kind').notNull(), // 'normal' | 'sensitive'
  domain: text('domain').notNull(),
  category: text('category'),
  titleAlias: text('title_alias'),
  clickCount: integer('click_count').default(0),
  createdBy: text('created_by'), // Clerk user ID
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Profile photos table for avatar uploads with Vercel Blob
export const profilePhotos = pgTable('profile_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  creatorProfileId: uuid('creator_profile_id').references(
    () => creatorProfiles.id,
    { onDelete: 'cascade' }
  ),
  ingestionOwnerUserId: uuid('ingestion_owner_user_id').references(
    () => users.id,
    { onDelete: 'set null' }
  ),
  status: photoStatusEnum('status').notNull().default('uploading'),
  sourcePlatform: text('source_platform'),
  sourceType: ingestionSourceTypeEnum('source_type')
    .default('manual')
    .notNull(),
  confidence: numeric('confidence', { precision: 3, scale: 2 })
    .default('1.00')
    .notNull(),
  lockedByUser: boolean('locked_by_user').default(false).notNull(),

  // Vercel Blob URLs for different sizes
  blobUrl: text('blob_url'), // Original uploaded image
  smallUrl: text('small_url'), // 128x128 for thumbnails
  mediumUrl: text('medium_url'), // 256x256 for profile displays
  largeUrl: text('large_url'), // 512x512 for high-res displays

  // Image metadata
  originalFilename: text('original_filename'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'), // in bytes
  width: integer('width'),
  height: integer('height'),

  // Processing metadata
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const ingestionJobs = pgTable('ingestion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: text('job_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: ingestionJobStatusEnum('status').default('pending').notNull(),
  error: text('error'),
  attempts: integer('attempts').default(0).notNull(),
  runAt: timestamp('run_at').defaultNow().notNull(),
  priority: integer('priority').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  nextRunAt: timestamp('next_run_at'),
  dedupKey: text('dedup_key'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const scraperConfigs = pgTable('scraper_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  network: text('network').notNull(),
  strategy: scraperStrategyEnum('strategy').default('http').notNull(),
  maxConcurrency: integer('max_concurrency').default(1).notNull(),
  maxJobsPerMinute: integer('max_jobs_per_minute').default(30).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Waitlist entries for invite-only access
export const waitlistEntries = pgTable('waitlist_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  primarySocialUrl: text('primary_social_url').notNull(),
  primarySocialPlatform: text('primary_social_platform').notNull(),
  primarySocialUrlNormalized: text('primary_social_url_normalized').notNull(),
  spotifyUrl: text('spotify_url'),
  spotifyUrlNormalized: text('spotify_url_normalized'),
  heardAbout: text('heard_about'),
  primaryGoal: text('primary_goal'),
  selectedPlan: text('selected_plan'), // free|pro|growth|branding - quietly tracks pricing tier interest
  status: waitlistStatusEnum('status').default('new').notNull(),
  primarySocialFollowerCount: integer('primary_social_follower_count'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const waitlistInvites = pgTable(
  'waitlist_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    waitlistEntryId: uuid('waitlist_entry_id')
      .notNull()
      .references(() => waitlistEntries.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    claimToken: text('claim_token').notNull(),
    status: waitlistInviteStatusEnum('status').default('pending').notNull(),
    error: text('error'),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    runAt: timestamp('run_at').defaultNow().notNull(),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    waitlistEntryIdUnique: uniqueIndex('idx_waitlist_invites_entry_id').on(
      table.waitlistEntryId
    ),
  })
);

// Schema validations
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertProviderSchema = createInsertSchema(providers);
export const selectProviderSchema = createSelectSchema(providers);

export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles);

export const selectCreatorProfileSchema = createSelectSchema(creatorProfiles);

export const insertDiscogReleaseSchema = createInsertSchema(discogReleases);
export const selectDiscogReleaseSchema = createSelectSchema(discogReleases);

export const insertDiscogTrackSchema = createInsertSchema(discogTracks);
export const selectDiscogTrackSchema = createSelectSchema(discogTracks);

export const insertProviderLinkSchema = createInsertSchema(providerLinks);
export const selectProviderLinkSchema = createSelectSchema(providerLinks);

export const insertSmartLinkTargetSchema = createInsertSchema(smartLinkTargets);
export const selectSmartLinkTargetSchema = createSelectSchema(smartLinkTargets);

export const insertSocialLinkSchema = createInsertSchema(socialLinks);
export const selectSocialLinkSchema = createSelectSchema(socialLinks);

export const insertCreatorContactSchema = createInsertSchema(creatorContacts);
export const selectCreatorContactSchema = createSelectSchema(creatorContacts);

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

export const insertSignedLinkAccessSchema =
  createInsertSchema(signedLinkAccess);
export const selectSignedLinkAccessSchema =
  createSelectSchema(signedLinkAccess);

export const insertWrappedLinkSchema = createInsertSchema(wrappedLinks);
export const selectWrappedLinkSchema = createSelectSchema(wrappedLinks);

export const insertStripeWebhookEventSchema =
  createInsertSchema(stripeWebhookEvents);
export const selectStripeWebhookEventSchema =
  createSelectSchema(stripeWebhookEvents);

export const insertProfilePhotoSchema = createInsertSchema(profilePhotos);
export const selectProfilePhotoSchema = createSelectSchema(profilePhotos);

export const insertSocialAccountSchema = createInsertSchema(socialAccounts);
export const selectSocialAccountSchema = createSelectSchema(socialAccounts);

export const insertIngestionJobSchema = createInsertSchema(ingestionJobs);
export const selectIngestionJobSchema = createSelectSchema(ingestionJobs);

export const insertScraperConfigSchema = createInsertSchema(scraperConfigs);
export const selectScraperConfigSchema = createSelectSchema(scraperConfigs);

export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries);
export const selectWaitlistEntrySchema = createSelectSchema(waitlistEntries);

export const insertWaitlistInviteSchema = createInsertSchema(waitlistInvites);
export const selectWaitlistInviteSchema = createSelectSchema(waitlistInvites);

export const insertBillingAuditLogSchema = createInsertSchema(billingAuditLog);
export const selectBillingAuditLogSchema = createSelectSchema(billingAuditLog);

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;

export type DiscogRelease = typeof discogReleases.$inferSelect;
export type NewDiscogRelease = typeof discogReleases.$inferInsert;

export type DiscogTrack = typeof discogTracks.$inferSelect;
export type NewDiscogTrack = typeof discogTracks.$inferInsert;

export type ProviderLink = typeof providerLinks.$inferSelect;
export type NewProviderLink = typeof providerLinks.$inferInsert;

export type SmartLinkTarget = typeof smartLinkTargets.$inferSelect;
export type NewSmartLinkTarget = typeof smartLinkTargets.$inferInsert;

export type SocialLink = typeof socialLinks.$inferSelect;
export type NewSocialLink = typeof socialLinks.$inferInsert;

export type CreatorContact = typeof creatorContacts.$inferSelect;
export type NewCreatorContact = typeof creatorContacts.$inferInsert;

export type ClickEvent = typeof clickEvents.$inferSelect;
export type NewClickEvent = typeof clickEvents.$inferInsert;

export type NotificationSubscription =
  typeof notificationSubscriptions.$inferSelect;
export type NewNotificationSubscription =
  typeof notificationSubscriptions.$inferInsert;

export type Tip = typeof tips.$inferSelect;
export type NewTip = typeof tips.$inferInsert;

export type SignedLinkAccess = typeof signedLinkAccess.$inferSelect;
export type NewSignedLinkAccess = typeof signedLinkAccess.$inferInsert;

export type WrappedLink = typeof wrappedLinks.$inferSelect;
export type NewWrappedLink = typeof wrappedLinks.$inferInsert;

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;

export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type NewProfilePhoto = typeof profilePhotos.$inferInsert;

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;

export type ScraperConfig = typeof scraperConfigs.$inferSelect;
export type NewScraperConfig = typeof scraperConfigs.$inferInsert;

export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type NewWaitlistEntry = typeof waitlistEntries.$inferInsert;

export type WaitlistInvite = typeof waitlistInvites.$inferSelect;
export type NewWaitlistInvite = typeof waitlistInvites.$inferInsert;

export type BillingAuditLog = typeof billingAuditLog.$inferSelect;
export type NewBillingAuditLog = typeof billingAuditLog.$inferInsert;
