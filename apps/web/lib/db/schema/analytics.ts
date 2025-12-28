import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { creatorProfiles, socialLinks } from './creators';

/**
 * Analytics domain schema.
 * Audience tracking and click analytics for creators.
 * Depends on: creators (for foreign key references)
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Type of link being clicked (listen, social, tip, etc.).
 */
export const linkTypeEnum = pgEnum('link_type', [
  'listen',
  'social',
  'tip',
  'other',
]);

/**
 * Type of audience member based on identification method.
 */
export const audienceMemberTypeEnum = pgEnum('audience_member_type', [
  'anonymous',
  'email',
  'sms',
  'spotify',
  'customer',
]);

/**
 * Device type for audience segmentation.
 */
export const audienceDeviceTypeEnum = pgEnum('audience_device_type', [
  'mobile',
  'desktop',
  'tablet',
  'unknown',
]);

/**
 * Intent level for audience engagement scoring.
 */
export const audienceIntentLevelEnum = pgEnum('audience_intent_level', [
  'high',
  'medium',
  'low',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Audience members - visitors and fans tracked across a creator's profile.
 * Supports anonymous fingerprinting and identified members (email, Spotify, etc.).
 */
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

/**
 * Click events - analytics for link clicks on creator profiles.
 * Tracks geographic, device, and bot information for each click.
 */
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
    // Composite index for analytics queries that exclude bot traffic
    // Query pattern: WHERE creator_profile_id = ? AND (is_bot = false OR is_bot IS NULL) AND created_at >= ?
    creatorProfileIsBotCreatedAtIdx: index(
      'click_events_creator_profile_id_is_bot_created_at_idx'
    ).on(table.creatorProfileId, table.isBot, table.createdAt),
  })
);
