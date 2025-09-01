/**
 * Drizzle ORM schema definitions
 *
 * This file exports all schema definitions for the application.
 * It will be populated with actual table definitions in future tasks.
 *
 * For now, it serves as a placeholder to ensure the schema directory
 * is included in the repository.
 */

import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

// Theme enum for user settings
export const themeModeEnum = pgEnum('theme_mode', ['system', 'light', 'dark']);

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

export const creatorProfiles = pgTable('creator_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
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
  lastLoginAt: timestamp('last_login_at'),
  profileViews: integer('profile_views').default(0),
  onboardingCompletedAt: timestamp('onboarding_completed_at'),
  settings: jsonb('settings').$type<Record<string, unknown>>(),
  theme: jsonb('theme').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Profile photos enum for upload status
export const photoStatusEnum = pgEnum('photo_status', [
  'uploading',
  'processing',
  'completed',
  'failed',
]);

// Profile photos table for avatar uploads with Vercel Blob
export const profilePhotos = pgTable('profile_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  creatorProfileId: uuid('creator_profile_id').references(() => creatorProfiles.id, { onDelete: 'cascade' }),
  status: photoStatusEnum('status').notNull().default('uploading'),
  
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

// Export all schemas
export const schemas = {
  users,
  creatorProfiles,
  socialLinks,
  userSettings,
  profilePhotos,
};
