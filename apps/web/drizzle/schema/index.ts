/**
 * Drizzle ORM schema definitions
 *
 * This file exports all schema definitions for the application.
 * It will be populated with actual table definitions in future tasks.
 *
 * For now, it serves as a placeholder to ensure the schema directory
 * is included in the repository.
 */

import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  creatorTypeEnum,
  ingestionJobStatusEnum,
  ingestionSourceTypeEnum,
  ingestionStatusEnum,
  photoStatusEnum,
  scraperStrategyEnum,
  socialAccountStatusEnum,
  socialLinkStateEnum,
  themeModeEnum,
} from '../../lib/db/schema';

// Enums are imported from main schema to avoid duplication

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').unique().notNull(),
  email: text('email').unique(),
  isPro: boolean('is_pro').default(false),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  billingUpdatedAt: timestamp('billing_updated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Separate user-level settings (distinct from creator profile)
export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  themeMode: themeModeEnum('theme_mode').notNull().default('system'),
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
    avatarLockedByUser: boolean('avatar_locked_by_user')
      .default(false)
      .notNull(),
    displayNameLocked: boolean('display_name_locked').default(false).notNull(),
    ingestionStatus: ingestionStatusEnum('ingestion_status')
      .default('idle')
      .notNull(),
    lastLoginAt: timestamp('last_login_at'),
    profileViews: integer('profile_views').default(0),
    onboardingCompletedAt: timestamp('onboarding_completed_at'),
    settings: jsonb('settings').$type<Record<string, unknown>>(),
    theme: jsonb('theme').$type<Record<string, unknown>>(),
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

// Profile photos enum imported from main schema

// Profile photos table for avatar uploads with Vercel Blob
export const profilePhotos = pgTable('profile_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ingestionOwnerUserId: uuid('ingestion_owner_user_id').references(
    () => users.id,
    { onDelete: 'set null' }
  ),
  creatorProfileId: uuid('creator_profile_id').references(
    () => creatorProfiles.id,
    { onDelete: 'cascade' }
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
  rawData: jsonb('raw_data').$type<Record<string, unknown>>(),
  sourcePlatform: text('source_platform'),
  sourceType: ingestionSourceTypeEnum('source_type')
    .default('ingested')
    .notNull(),
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

// Re-export enums from main schema
export {
  creatorTypeEnum,
  ingestionJobStatusEnum,
  ingestionSourceTypeEnum,
  ingestionStatusEnum,
  linkTypeEnum,
  photoStatusEnum,
  scraperStrategyEnum,
  socialAccountStatusEnum,
  socialLinkStateEnum,
  themeModeEnum,
} from '../../lib/db/schema';

// Export all schemas
export const schemas = {
  users,
  creatorProfiles,
  socialLinks,
  userSettings,
  profilePhotos,
  socialAccounts,
  ingestionJobs,
  scraperConfigs,
};
