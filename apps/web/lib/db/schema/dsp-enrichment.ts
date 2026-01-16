import { sql } from 'drizzle-orm';
import {
  boolean,
  decimal,
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
import { notificationSubscriptions } from './analytics';
import { discogReleases } from './content';
import {
  dspMatchStatusEnum,
  releaseNotificationStatusEnum,
  releaseNotificationTypeEnum,
  socialSuggestionStatusEnum,
} from './enums';
import { creatorProfiles } from './profiles';

/**
 * Confidence score breakdown for DSP artist matching.
 * Each field stores the points awarded for that criterion.
 */
export interface DspMatchConfidenceBreakdown {
  /** ISRC match score - % of sampled tracks with ISRC matches (weight: 0.50) */
  isrcMatchScore: number;
  /** UPC match score - % of albums with UPC matches (weight: 0.20) */
  upcMatchScore: number;
  /** Name similarity score - Jaro-Winkler on artist names (weight: 0.15) */
  nameSimilarityScore: number;
  /** Follower ratio score - similar follower counts within 10x (weight: 0.10) */
  followerRatioScore: number;
  /** Genre overlap score - common genres (weight: 0.05) */
  genreOverlapScore: number;
  /** Metadata about the scoring */
  meta?: {
    calculatedAt: string;
    version: number;
    matchingIsrcs?: string[];
    matchingUpcs?: string[];
    commonGenres?: string[];
  };
}

/**
 * Image URLs from DSP enrichment data
 */
export interface DspImageUrls {
  small?: string;
  medium?: string;
  large?: string;
  original?: string;
}

/**
 * External URLs from DSP profiles (social links, website, etc.)
 */
export interface DspExternalUrls {
  website?: string;
  instagram?: string;
  twitter?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  bandcamp?: string;
  soundcloud?: string;
  [key: string]: string | undefined;
}

/**
 * Confidence breakdown for social link suggestions
 */
export interface SocialSuggestionConfidenceBreakdown {
  /** Artist name exact match (weight: 0.40) */
  nameMatchScore: number;
  /** MBID linked to same Spotify (weight: 0.30) */
  spotifyLinkScore: number;
  /** Other DSPs also link to same social (weight: 0.20) */
  crossDspScore: number;
  /** Recent MusicBrainz edit - fresh data (weight: 0.10) */
  dataFreshnessScore: number;
  meta?: {
    calculatedAt: string;
    sourceProvider: string;
  };
}

// ============================================================================
// DSP Artist Matches - Artist-level cross-platform matches
// ============================================================================

export const dspArtistMatches = pgTable(
  'dsp_artist_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // e.g., 'apple_music', 'deezer'
    externalArtistId: text('external_artist_id'),
    externalArtistName: text('external_artist_name'),
    externalArtistUrl: text('external_artist_url'),
    externalArtistImageUrl: text('external_artist_image_url'),
    confidenceScore: decimal('confidence_score', { precision: 5, scale: 4 }),
    confidenceBreakdown: jsonb(
      'confidence_breakdown'
    ).$type<DspMatchConfidenceBreakdown>(),
    matchingIsrcCount: integer('matching_isrc_count').default(0).notNull(),
    matchingUpcCount: integer('matching_upc_count').default(0).notNull(),
    totalTracksChecked: integer('total_tracks_checked').default(0).notNull(),
    status: dspMatchStatusEnum('status').default('suggested').notNull(),
    confirmedAt: timestamp('confirmed_at'),
    confirmedBy: uuid('confirmed_by'),
    rejectedAt: timestamp('rejected_at'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique constraint per creator + provider
    creatorProviderUnique: uniqueIndex(
      'dsp_artist_matches_creator_provider_unique'
    ).on(table.creatorProfileId, table.providerId),
    // Index for finding suggested matches
    statusIdx: index('dsp_artist_matches_status_idx').on(
      table.status,
      table.createdAt
    ),
    // Index for confidence-based queries
    confidenceIdx: index('dsp_artist_matches_confidence_idx').on(
      table.confidenceScore
    ),
  })
);

// ============================================================================
// DSP Artist Enrichment - Profile data from each DSP
// ============================================================================

export const dspArtistEnrichment = pgTable(
  'dsp_artist_enrichment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // e.g., 'apple_music', 'deezer', 'musicbrainz'
    externalArtistId: text('external_artist_id'),
    name: text('name'),
    bio: text('bio'),
    genres: text('genres').array(),
    imageUrls: jsonb('image_urls').$type<DspImageUrls>(),
    followerCount: integer('follower_count'),
    monthlyListeners: integer('monthly_listeners'),
    verified: boolean('verified'),
    country: text('country'),
    hometown: text('hometown'),
    externalUrls: jsonb('external_urls').$type<DspExternalUrls>(),
    // MusicBrainz specific fields
    mbid: text('mbid'), // MusicBrainz ID
    foundingDate: text('founding_date'), // life-span.begin
    disbandedDate: text('disbanded_date'), // life-span.end
    artistType: text('artist_type'), // Person, Group, Orchestra, etc.
    aliases: text('aliases').array(),
    isnis: text('isnis').array(), // International Standard Name Identifiers
    rawResponse: jsonb('raw_response').$type<Record<string, unknown>>(),
    fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique per creator + provider
    creatorProviderUnique: uniqueIndex(
      'dsp_artist_enrichment_creator_provider_unique'
    ).on(table.creatorProfileId, table.providerId),
    // Index for fetching enrichment data
    providerIdx: index('dsp_artist_enrichment_provider_idx').on(
      table.providerId
    ),
  })
);

// ============================================================================
// Release Sync Status - Track discography sync state per creator/provider
// ============================================================================

export const releaseSyncStatus = pgTable(
  'release_sync_status',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    lastFullSyncAt: timestamp('last_full_sync_at'),
    lastIncrementalSyncAt: timestamp('last_incremental_sync_at'),
    nextScheduledSyncAt: timestamp('next_scheduled_sync_at'),
    totalReleasesSynced: integer('total_releases_synced').default(0).notNull(),
    releasesWithMatches: integer('releases_with_matches').default(0).notNull(),
    lastNewReleaseFoundAt: timestamp('last_new_release_found_at'),
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique per creator + provider
    creatorProviderUnique: uniqueIndex(
      'release_sync_status_creator_provider_unique'
    ).on(table.creatorProfileId, table.providerId),
    // Index for finding profiles due for sync
    nextSyncIdx: index('release_sync_status_next_sync_idx').on(
      table.nextScheduledSyncAt
    ),
    // Index for finding failed syncs
    failuresIdx: index('release_sync_status_failures_idx').on(
      table.consecutiveFailures
    ),
  })
);

// ============================================================================
// Fan Release Notifications - Queue for fan emails about new releases
// ============================================================================

export const fanReleaseNotifications = pgTable(
  'fan_release_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    notificationSubscriptionId: uuid('notification_subscription_id')
      .notNull()
      .references(() => notificationSubscriptions.id, { onDelete: 'cascade' }),
    notificationType:
      releaseNotificationTypeEnum('notification_type').notNull(),
    scheduledFor: timestamp('scheduled_for').notNull(),
    status: releaseNotificationStatusEnum('status')
      .default('pending')
      .notNull(),
    sentAt: timestamp('sent_at'),
    error: text('error'),
    dedupKey: text('dedup_key').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique dedup key to prevent duplicate notifications
    dedupKeyUnique: uniqueIndex(
      'fan_release_notifications_dedup_key_unique'
    ).on(table.dedupKey),
    // Index for processing pending notifications
    statusScheduledIdx: index(
      'fan_release_notifications_status_scheduled_idx'
    ).on(table.status, table.scheduledFor),
    // Index for finding notifications by release
    releaseIdx: index('fan_release_notifications_release_idx').on(
      table.releaseId
    ),
    // Index for finding notifications by creator
    creatorIdx: index('fan_release_notifications_creator_idx').on(
      table.creatorProfileId
    ),
  })
);

// ============================================================================
// Social Link Suggestions - Suggested social profiles from MusicBrainz/DSPs
// ============================================================================

export const socialLinkSuggestions = pgTable(
  'social_link_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    // Source of suggestion
    sourceProvider: text('source_provider').notNull(), // 'musicbrainz', 'apple_music', etc.
    sourceArtistId: text('source_artist_id'),
    // Suggested social link
    platform: text('platform').notNull(), // 'instagram', 'twitter', 'tiktok', etc.
    url: text('url').notNull(),
    username: text('username'), // Extracted handle if possible
    // Confidence
    confidenceScore: decimal('confidence_score', {
      precision: 5,
      scale: 4,
    }).notNull(),
    confidenceBreakdown: jsonb(
      'confidence_breakdown'
    ).$type<SocialSuggestionConfidenceBreakdown>(),
    // Status
    status: socialSuggestionStatusEnum('status').default('pending').notNull(),
    emailSentAt: timestamp('email_sent_at'),
    respondedAt: timestamp('responded_at'),
    // Dedup
    dedupKey: text('dedup_key').notNull(), // creator_profile_id:platform:url_hash
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique dedup key
    dedupKeyUnique: uniqueIndex('social_link_suggestions_dedup_key_unique').on(
      table.dedupKey
    ),
    // Index for finding pending suggestions
    statusCreatedIdx: index('social_link_suggestions_status_created_idx').on(
      table.status,
      table.createdAt
    ),
    // Index for finding suggestions by creator
    creatorIdx: index('social_link_suggestions_creator_idx').on(
      table.creatorProfileId,
      table.status
    ),
    // Index for expiring old suggestions
    expiresIdx: index('social_link_suggestions_expires_idx')
      .on(table.expiresAt)
      .where(sql`expires_at IS NOT NULL`),
  })
);

// ============================================================================
// Schema Validations
// ============================================================================

export const insertDspArtistMatchSchema = createInsertSchema(dspArtistMatches);
export const selectDspArtistMatchSchema = createSelectSchema(dspArtistMatches);

export const insertDspArtistEnrichmentSchema =
  createInsertSchema(dspArtistEnrichment);
export const selectDspArtistEnrichmentSchema =
  createSelectSchema(dspArtistEnrichment);

export const insertReleaseSyncStatusSchema =
  createInsertSchema(releaseSyncStatus);
export const selectReleaseSyncStatusSchema =
  createSelectSchema(releaseSyncStatus);

export const insertFanReleaseNotificationSchema = createInsertSchema(
  fanReleaseNotifications
);
export const selectFanReleaseNotificationSchema = createSelectSchema(
  fanReleaseNotifications
);

export const insertSocialLinkSuggestionSchema = createInsertSchema(
  socialLinkSuggestions
);
export const selectSocialLinkSuggestionSchema = createSelectSchema(
  socialLinkSuggestions
);

// ============================================================================
// Types
// ============================================================================

export type DspArtistMatch = typeof dspArtistMatches.$inferSelect;
export type NewDspArtistMatch = typeof dspArtistMatches.$inferInsert;

export type DspArtistEnrichment = typeof dspArtistEnrichment.$inferSelect;
export type NewDspArtistEnrichment = typeof dspArtistEnrichment.$inferInsert;

export type ReleaseSyncStatus = typeof releaseSyncStatus.$inferSelect;
export type NewReleaseSyncStatus = typeof releaseSyncStatus.$inferInsert;

export type FanReleaseNotification =
  typeof fanReleaseNotifications.$inferSelect;
export type NewFanReleaseNotification =
  typeof fanReleaseNotifications.$inferInsert;

export type SocialLinkSuggestion = typeof socialLinkSuggestions.$inferSelect;
export type NewSocialLinkSuggestion = typeof socialLinkSuggestions.$inferInsert;
