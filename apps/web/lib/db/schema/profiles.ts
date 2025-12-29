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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import {
  contactChannelEnum,
  contactRoleEnum,
  creatorTypeEnum,
  ingestionSourceTypeEnum,
  ingestionStatusEnum,
  photoStatusEnum,
} from './enums';

// Creator profiles table
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
    usernameNormalizedUnique: uniqueIndex(
      'creator_profiles_username_normalized_unique'
    )
      .on(table.usernameNormalized)
      .where(drizzleSql`username_normalized IS NOT NULL`),
  })
);

// Creator contacts table
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
  blobUrl: text('blob_url'),
  smallUrl: text('small_url'),
  mediumUrl: text('medium_url'),
  largeUrl: text('large_url'),
  originalFilename: text('original_filename'),
  mimeType: text('mime_type'),
  fileSize: integer('file_size'),
  width: integer('width'),
  height: integer('height'),
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Schema validations
export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles);
export const selectCreatorProfileSchema = createSelectSchema(creatorProfiles);

export const insertCreatorContactSchema = createInsertSchema(creatorContacts);
export const selectCreatorContactSchema = createSelectSchema(creatorContacts);

export const insertProfilePhotoSchema = createInsertSchema(profilePhotos);
export const selectProfilePhotoSchema = createSelectSchema(profilePhotos);

// Types
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;

export type CreatorContact = typeof creatorContacts.$inferSelect;
export type NewCreatorContact = typeof creatorContacts.$inferInsert;

export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type NewProfilePhoto = typeof profilePhotos.$inferInsert;
