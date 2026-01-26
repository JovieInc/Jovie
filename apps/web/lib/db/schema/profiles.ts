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
  claimInviteStatusEnum,
  contactChannelEnum,
  contactRoleEnum,
  creatorTypeEnum,
  ingestionSourceTypeEnum,
  ingestionStatusEnum,
  photoStatusEnum,
} from './enums';
import { waitlistEntries } from './waitlist';

/**
 * Notification preferences for creators.
 * Allows granular control over notification categories.
 */
export interface NotificationPreferences {
  // Release notifications (for artist profiles)
  releasePreview?: boolean;
  releaseDay?: boolean;
  // Profile suggestions
  dspMatchSuggested?: boolean;
  socialLinkSuggested?: boolean;
  // Profile updates
  enrichmentComplete?: boolean;
  newReleaseDetected?: boolean;
}

/**
 * Fit score breakdown for GTM prioritization.
 * Each field stores the points awarded for that criterion.
 */
export interface FitScoreBreakdown {
  /** Uses a link-in-bio product (Linktree, Beacons, etc.) - max 15 points */
  usesLinkInBio: number;
  /** Paid tier on link-in-bio (no branding visible) - max 20 points */
  paidTier: number;
  /** Uses music-specific tools (Linkfire, Feature.fm, ToneDen, Laylo) - max 10 points */
  usesMusicTools: number;
  /** Has a Spotify profile linked - max 15 points */
  hasSpotify: number;
  /** Spotify popularity score mapped to 0-15 points */
  spotifyPopularity: number;
  /** Release recency: last 6mo = 10, last year = 5, older = 0 */
  releaseRecency: number;
  /** Target genre match (electronic/DJ) - max 5 points */
  genreMatch: number;
  /** Metadata about the scoring */
  meta?: {
    calculatedAt: string;
    version: number;
    musicToolsDetected?: string[];
    matchedGenres?: string[];
    latestReleaseDate?: string;
  };
}

// Creator profiles table
export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    waitlistEntryId: uuid('waitlist_entry_id').references(
      () => waitlistEntries.id,
      {
        onDelete: 'set null',
      }
    ),
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
    // Additional DSP IDs for cross-platform matching
    appleMusicId: text('apple_music_id'),
    youtubeMusicId: text('youtube_music_id'),
    deezerId: text('deezer_id'),
    tidalId: text('tidal_id'),
    soundcloudId: text('soundcloud_id'),
    musicbrainzId: text('musicbrainz_id'), // MusicBrainz MBID
    // Tour date integration
    bandsintownArtistName: text('bandsintown_artist_name'), // For Bandsintown sync
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
    // Notification preferences for granular control
    notificationPreferences: jsonb('notification_preferences')
      .$type<NotificationPreferences>()
      .default({
        releasePreview: true,
        releaseDay: true,
        dspMatchSuggested: true,
        socialLinkSuggested: true,
        enrichmentComplete: false,
        newReleaseDetected: true,
      }),
    // Fit scoring for GTM prioritization
    fitScore: integer('fit_score'),
    fitScoreBreakdown: jsonb('fit_score_breakdown').$type<FitScoreBreakdown>(),
    fitScoreUpdatedAt: timestamp('fit_score_updated_at'),
    // Spotify enrichment data
    genres: text('genres').array(),
    spotifyFollowers: integer('spotify_followers'),
    spotifyPopularity: integer('spotify_popularity'),
    // Ingestion source tracking for fit scoring
    ingestionSourcePlatform: text('ingestion_source_platform'),
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
    oneClaimedProfilePerUser: uniqueIndex(
      'idx_creator_profiles_one_claimed_per_user'
    )
      .on(table.userId)
      .where(drizzleSql`is_claimed = true`),
    // Index for GTM prioritization - sort unclaimed profiles by fit score
    fitScoreUnclaimedIndex: index('idx_creator_profiles_fit_score_unclaimed')
      .on(table.fitScore, table.isClaimed, table.createdAt)
      .where(drizzleSql`is_claimed = false AND fit_score IS NOT NULL`),
    // Performance index: session context lookups (user + claimed profile)
    userIdClaimedIndex: index('idx_creator_profiles_user_id_claimed').on(
      table.userId,
      table.isClaimed
    ),
    // Performance index: DSP enrichment lookups by Spotify ID
    spotifyIdIndex: index('idx_creator_profiles_spotify_id')
      .on(table.spotifyId)
      .where(drizzleSql`spotify_id IS NOT NULL`),
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

// Creator claim invites table for tracking email invitations to claim profiles
export const creatorClaimInvites = pgTable(
  'creator_claim_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    creatorContactId: uuid('creator_contact_id').references(
      () => creatorContacts.id,
      { onDelete: 'set null' }
    ),
    email: text('email').notNull(),
    status: claimInviteStatusEnum('status').default('pending').notNull(),
    sendAt: timestamp('send_at'),
    sentAt: timestamp('sent_at'),
    error: text('error'),
    subject: text('subject'),
    body: text('body'),
    aiVariantId: text('ai_variant_id'),
    meta: jsonb('meta')
      .$type<{ source?: 'admin_click' | 'bulk' | 'auto' }>()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileIdIdx: index(
      'idx_creator_claim_invites_creator_profile_id'
    ).on(table.creatorProfileId),
    statusIdx: index('idx_creator_claim_invites_status').on(table.status),
    sendAtIdx: index('idx_creator_claim_invites_send_at').on(table.sendAt),
    // Unique constraint to prevent duplicate invites for same profile + email
    uniqueProfileEmail: uniqueIndex(
      'idx_creator_claim_invites_profile_email_unique'
    ).on(table.creatorProfileId, table.email),
  })
);

// Schema validations
export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles);
export const selectCreatorProfileSchema = createSelectSchema(creatorProfiles);

export const insertCreatorContactSchema = createInsertSchema(creatorContacts);
export const selectCreatorContactSchema = createSelectSchema(creatorContacts);

export const insertProfilePhotoSchema = createInsertSchema(profilePhotos);
export const selectProfilePhotoSchema = createSelectSchema(profilePhotos);

export const insertCreatorClaimInviteSchema =
  createInsertSchema(creatorClaimInvites);
export const selectCreatorClaimInviteSchema =
  createSelectSchema(creatorClaimInvites);

// Types
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;

export type CreatorContact = typeof creatorContacts.$inferSelect;
export type NewCreatorContact = typeof creatorContacts.$inferInsert;

export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type NewProfilePhoto = typeof profilePhotos.$inferInsert;

export type CreatorClaimInvite = typeof creatorClaimInvites.$inferSelect;
export type NewCreatorClaimInvite = typeof creatorClaimInvites.$inferInsert;
