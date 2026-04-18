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
  creatorDistributionEventTypeEnum,
  creatorDistributionPlatformEnum,
  creatorTypeEnum,
  ingestionSourceTypeEnum,
  ingestionStatusEnum,
  outreachChannelEnum,
  outreachStatusEnum,
  photoStatusEnum,
  profileClaimRoleEnum,
  profileOwnershipActionEnum,
} from './enums';
// eslint-disable-next-line import/no-cycle -- mutual FK references between profiles and waitlist tables
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

export interface DiscoveredPixelPlatform {
  detected: true;
  pixelIds: string[];
}

export interface DiscoveredPixels {
  facebook?: DiscoveredPixelPlatform;
  tiktok?: DiscoveredPixelPlatform;
  google?: DiscoveredPixelPlatform;
}

export interface CreatorDistributionEventMetadata {
  [key: string]: unknown;
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
  /** Has alternative DSP presence (Apple Music, SoundCloud) - max 10 points */
  hasAlternativeDsp?: number;
  /** Multi-platform presence bonus - max 5 points */
  multiDspPresence?: number;
  /** Has contact email available - max 5 points */
  hasContactEmail?: number;
  /** Has paid verification on social platforms (Twitter/X, Instagram, Facebook, Threads) - max 10 points */
  paidVerification?: number;
  /** SoundCloud Pro/Pro Unlimited/Next Pro subscription (music-specific paid, stronger signal) - max 10 points */
  soundcloudPro?: number;
  /** Has tracking pixels on link-in-bio (Facebook, TikTok, Google) - max 5 points */
  hasTrackingPixels?: number;
  /** Metadata about the scoring */
  meta?: {
    calculatedAt: string;
    version: number;
    musicToolsDetected?: string[];
    matchedGenres?: string[];
    latestReleaseDate?: string;
    alternativeDspPlatforms?: string[];
    dspPlatformCount?: number;
    paidVerificationPlatforms?: string[];
    soundcloudProTier?: string;
  };
}

// Creator profiles table
export const creatorProfiles = pgTable(
  'creator_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // @deprecated — ownership now tracked via userProfileClaims join table.
    // Kept for backward compatibility during migration. Will be removed once
    // all consumers are migrated to use userProfileClaims/activeProfileId.
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
    careerHighlights: text('career_highlights'),
    targetPlaylists: text('target_playlists').array(),
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
    bandsintownApiKey: text('bandsintown_api_key'), // Encrypted user-provided API key
    isPublic: boolean('is_public').default(true),
    isVerified: boolean('is_verified').default(false),
    isFeatured: boolean('is_featured').default(false),
    marketingOptOut: boolean('marketing_opt_out').default(false),
    // @deprecated — claimed status now derived from userProfileClaims.
    // Kept for backward compatibility during migration.
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
    usernameLockedAt: timestamp('username_locked_at'),
    ingestionStatus: ingestionStatusEnum('ingestion_status')
      .default('idle')
      .notNull(),
    lastIngestionError: text('last_ingestion_error'),
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
    // Tracking pixel detection from link-in-bio pages
    discoveredPixels: jsonb('discovered_pixels').$type<DiscoveredPixels>(),
    discoveredPixelsAt: timestamp('discovered_pixels_at'),
    // Spotify enrichment data
    genres: text('genres').array(),
    location: text('location'),
    activeSinceYear: integer('active_since_year'),
    spotifyFollowers: integer('spotify_followers'),
    spotifyPopularity: integer('spotify_popularity'),
    // Ingestion source tracking for fit scoring
    ingestionSourcePlatform: text('ingestion_source_platform'),
    outreachStatus: outreachStatusEnum('outreach_status').default('pending'),
    outreachChannel: outreachChannelEnum('outreach_channel'),
    dmSentAt: timestamp('dm_sent_at'),
    dmCopy: text('dm_copy'),
    // Stripe Connect fields for Express onboarding
    stripeAccountId: text('stripe_account_id'),
    stripeOnboardingComplete: boolean('stripe_onboarding_complete')
      .default(false)
      .notNull(),
    stripePayoutsEnabled: boolean('stripe_payouts_enabled')
      .default(false)
      .notNull(),
    nextTaskNumber: integer('next_task_number').default(1).notNull(),
    smsAccessRequestedAt: timestamp('sms_access_requested_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    featuredCreatorsQueryIndex: index('idx_creator_profiles_featured_query')
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
    // Index for GTM prioritization - sort profiles by fit score (unclaimed = no claims row)
    fitScoreIndex: index('idx_creator_profiles_fit_score').on(
      table.fitScore,
      table.id
    ),
    // Performance index: Outreach dashboard filtering
    outreachStatusIndex: index('idx_creator_profiles_outreach_status').on(
      table.outreachStatus,
      table.createdAt
    ),
  })
);

// Creator contacts table
export const creatorContacts = pgTable(
  'creator_contacts',
  {
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
    forwardInboxEmails: boolean('forward_inbox_emails')
      .notNull()
      .default(false),
    autoMarkRead: boolean('auto_mark_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Covers: WHERE creatorProfileId = ? AND isActive = true ORDER BY sortOrder, createdAt
    profileActiveIdx: index('idx_creator_contacts_profile_active').on(
      table.creatorProfileId,
      table.isActive,
      table.sortOrder,
      table.createdAt
    ),
  })
);

// Creator avatar candidates table for ingestion suggestions
export const creatorAvatarCandidates = pgTable(
  'creator_avatar_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    sourcePlatform: text('source_platform').notNull(),
    sourceUrl: text('source_url'),
    avatarUrl: text('avatar_url').notNull(),
    confidenceScore: numeric('confidence_score', { precision: 4, scale: 3 })
      .default('0.700')
      .notNull(),
    colorPalette: jsonb('color_palette').$type<string[]>().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorAvatarCandidateProfileIdx: index(
      'idx_creator_avatar_candidates_profile_id'
    ).on(table.creatorProfileId),
    creatorAvatarCandidateUnique: uniqueIndex(
      'idx_creator_avatar_candidates_unique'
    ).on(table.creatorProfileId, table.avatarUrl),
  })
);

// Creator profile attributes history table
export const creatorProfileAttributes = pgTable(
  'creator_profile_attributes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    sourcePlatform: text('source_platform').notNull(),
    sourceUrl: text('source_url'),
    displayName: text('display_name'),
    bio: text('bio'),
    confidenceScore: numeric('confidence_score', { precision: 4, scale: 3 })
      .default('0.700')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileAttributesProfileIdx: index(
      'idx_creator_profile_attributes_profile_id'
    ).on(table.creatorProfileId, table.createdAt),
  })
);

// Profile photos table for avatar uploads with Vercel Blob
export const profilePhotos = pgTable(
  'profile_photos',
  {
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
    photoType: text('photo_type').notNull().default('avatar'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('idx_profile_photos_user_id').on(table.userId),
    creatorProfileIdx: index('idx_profile_photos_creator_profile_id').on(
      table.creatorProfileId
    ),
    ingestionOwnerIdx: index('idx_profile_photos_ingestion_owner').on(
      table.ingestionOwnerUserId
    ),
    typeStatusIdx: index('idx_profile_photos_type').on(
      table.creatorProfileId,
      table.photoType,
      table.status
    ),
  })
);

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
      .$type<{
        source?: 'admin_click' | 'bulk' | 'auto';
      }>()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorProfileIdIdx: index(
      'idx_creator_claim_invites_creator_profile_id'
    ).on(table.creatorProfileId),
    creatorContactIdIdx: index('idx_creator_claim_invites_contact_id').on(
      table.creatorContactId
    ),

    statusIdx: index('idx_creator_claim_invites_status').on(table.status),
    sendAtIdx: index('idx_creator_claim_invites_send_at').on(table.sendAt),
    // Unique constraint to prevent duplicate invites for same profile + email
    uniqueProfileEmail: uniqueIndex(
      'idx_creator_claim_invites_profile_email_unique'
    ).on(table.creatorProfileId, table.email),
  })
);

// User-to-profile ownership claims (many-to-many with roles)
export const userProfileClaims = pgTable(
  'user_profile_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    role: profileClaimRoleEnum('role').notNull().default('owner'),
    claimedAt: timestamp('claimed_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Each profile can only be claimed once (one owner/manager/viewer at a time per profile)
    uniqueProfile: uniqueIndex('idx_user_profile_claims_unique_profile').on(
      table.creatorProfileId
    ),
    userIdx: index('idx_user_profile_claims_user_id').on(table.userId),
  })
);

// Audit log for ownership changes
export const profileOwnershipLog = pgTable(
  'profile_ownership_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: profileOwnershipActionEnum('action').notNull(),
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    profileIdx: index('idx_profile_ownership_log_profile').on(
      table.creatorProfileId
    ),
  })
);

export const creatorDistributionEvents = pgTable(
  'creator_distribution_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    platform: creatorDistributionPlatformEnum('platform').notNull(),
    eventType: creatorDistributionEventTypeEnum('event_type').notNull(),
    metadata: jsonb('metadata')
      .$type<CreatorDistributionEventMetadata>()
      .notNull()
      .default({}),
    dedupeKey: text('dedupe_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    profilePlatformCreatedIdx: index(
      'idx_creator_distribution_events_profile_platform_created'
    ).on(table.creatorProfileId, table.platform, table.createdAt),
    profileEventCreatedIdx: index(
      'idx_creator_distribution_events_profile_event_created'
    ).on(table.creatorProfileId, table.eventType, table.createdAt),
    dedupeKeyUnique: uniqueIndex(
      'creator_distribution_events_dedupe_key_unique'
    )
      .on(table.dedupeKey)
      .where(drizzleSql`dedupe_key IS NOT NULL`),
  })
);

// Schema validations
export const insertCreatorProfileSchema = createInsertSchema(creatorProfiles);
export const selectCreatorProfileSchema = createSelectSchema(creatorProfiles);

export const insertCreatorContactSchema = createInsertSchema(creatorContacts);
export const selectCreatorContactSchema = createSelectSchema(creatorContacts);

export const insertProfilePhotoSchema = createInsertSchema(profilePhotos);
export const selectProfilePhotoSchema = createSelectSchema(profilePhotos);

export const insertCreatorAvatarCandidateSchema = createInsertSchema(
  creatorAvatarCandidates
);
export const selectCreatorAvatarCandidateSchema = createSelectSchema(
  creatorAvatarCandidates
);

export const insertCreatorProfileAttributeSchema = createInsertSchema(
  creatorProfileAttributes
);
export const selectCreatorProfileAttributeSchema = createSelectSchema(
  creatorProfileAttributes
);

export const insertCreatorClaimInviteSchema =
  createInsertSchema(creatorClaimInvites);
export const selectCreatorClaimInviteSchema =
  createSelectSchema(creatorClaimInvites);
export const insertCreatorDistributionEventSchema = createInsertSchema(
  creatorDistributionEvents
);
export const selectCreatorDistributionEventSchema = createSelectSchema(
  creatorDistributionEvents
);

// Types
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type NewCreatorProfile = typeof creatorProfiles.$inferInsert;

export type CreatorContact = typeof creatorContacts.$inferSelect;
export type NewCreatorContact = typeof creatorContacts.$inferInsert;

export type ProfilePhoto = typeof profilePhotos.$inferSelect;
export type NewProfilePhoto = typeof profilePhotos.$inferInsert;

export type CreatorAvatarCandidate =
  typeof creatorAvatarCandidates.$inferSelect;
export type NewCreatorAvatarCandidate =
  typeof creatorAvatarCandidates.$inferInsert;

export type CreatorProfileAttribute =
  typeof creatorProfileAttributes.$inferSelect;
export type NewCreatorProfileAttribute =
  typeof creatorProfileAttributes.$inferInsert;

export type CreatorClaimInvite = typeof creatorClaimInvites.$inferSelect;
export type NewCreatorClaimInvite = typeof creatorClaimInvites.$inferInsert;

export type CreatorDistributionEvent =
  typeof creatorDistributionEvents.$inferSelect;
export type NewCreatorDistributionEvent =
  typeof creatorDistributionEvents.$inferInsert;

export type UserProfileClaim = typeof userProfileClaims.$inferSelect;
export type NewUserProfileClaim = typeof userProfileClaims.$inferInsert;

export type ProfileOwnershipLog = typeof profileOwnershipLog.$inferSelect;
export type NewProfileOwnershipLog = typeof profileOwnershipLog.$inferInsert;

export const insertUserProfileClaimSchema =
  createInsertSchema(userProfileClaims);
export const selectUserProfileClaimSchema =
  createSelectSchema(userProfileClaims);

export const insertProfileOwnershipLogSchema =
  createInsertSchema(profileOwnershipLog);
export const selectProfileOwnershipLogSchema =
  createSelectSchema(profileOwnershipLog);
