import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
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

import { ingestionSourceTypeEnum, ingestionStatusEnum } from './shared/enums';
import { users } from './users';

/**
 * Creator domain schema.
 * Creator profiles, contacts, social presence, and profile media.
 * Depends on: users (for foreign key references)
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Type of creator (artist, podcaster, influencer, etc.).
 */
export const creatorTypeEnum = pgEnum('creator_type', [
  'artist',
  'podcaster',
  'influencer',
  'creator',
]);

/**
 * Role/purpose of a contact entry.
 */
export const contactRoleEnum = pgEnum('contact_role', [
  'bookings',
  'management',
  'press_pr',
  'brand_partnerships',
  'fan_general',
  'other',
]);

/**
 * Preferred contact channel.
 */
export const contactChannelEnum = pgEnum('contact_channel', ['email', 'phone']);

/**
 * State of a social link (active, suggested by system, or rejected by user).
 */
export const socialLinkStateEnum = pgEnum('social_link_state', [
  'active',
  'suggested',
  'rejected',
]);

/**
 * Status of a social account discovery.
 */
export const socialAccountStatusEnum = pgEnum('social_account_status', [
  'suspected',
  'confirmed',
  'rejected',
]);

/**
 * Profile photo upload/processing status.
 */
export const photoStatusEnum = pgEnum('photo_status', [
  'uploading',
  'processing',
  'ready',
  'failed',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Creator profiles - the main public-facing profile for creators.
 * A user can have one or more creator profiles.
 */
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
    usernameNormalizedUnique: uniqueIndex(
      'creator_profiles_username_normalized_unique'
    )
      .on(table.usernameNormalized)
      .where(drizzleSql`username_normalized IS NOT NULL`),
  })
);

/**
 * Creator contacts - business contact information for different purposes.
 */
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

/**
 * Social links - user-managed links displayed on creator profiles.
 * Supports both user-added and system-suggested links.
 */
export const socialLinks = pgTable(
  'social_links',
  {
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
    // Optimistic locking version for concurrent edit detection
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Composite index for dashboard social link filtering.
    creatorProfileStateIdx: index('social_links_creator_profile_state_idx').on(
      table.creatorProfileId,
      table.state,
      table.createdAt
    ),
  })
);

/**
 * Social accounts - discovered social media accounts for creators.
 * Used for account verification and profile enrichment.
 */
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

/**
 * Profile photos - avatar uploads with Vercel Blob.
 * Supports multiple sizes and processing states.
 */
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
