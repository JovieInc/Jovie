import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { pixelEventTypeEnum } from './enums';
import { creatorProfiles } from './profiles';

/**
 * Forwarding status entry for a single platform
 */
interface PlatformForwardingStatus {
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sentAt?: string;
  error?: string;
}

/**
 * Forwarding status for each platform.
 * Uses string index signature to support both creator pixels (facebook, google, tiktok)
 * and Jovie's own pixels (jovie_facebook, jovie_google, jovie_tiktok).
 */
export interface PixelForwardingStatus {
  facebook?: PlatformForwardingStatus;
  google?: PlatformForwardingStatus;
  tiktok?: PlatformForwardingStatus;
  // Jovie's own marketing pixels (distinct keys to prevent overwriting)
  jovie_facebook?: PlatformForwardingStatus;
  jovie_google?: PlatformForwardingStatus;
  jovie_tiktok?: PlatformForwardingStatus;
  // Allow additional dynamic keys for extensibility
  [key: string]: PlatformForwardingStatus | undefined;
}

/**
 * Event data payload based on event type
 */
export interface PixelEventData {
  // For link_click events
  linkId?: string;
  linkUrl?: string;
  linkTitle?: string;
  // For form_submit events
  formType?: string;
  // UTM parameters (normalized)
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  // UTM parameters (raw from client - snake_case)
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  // Referrer
  referrer?: string;
  // Page info
  pageUrl?: string;
  // Allow additional fields
  [key: string]: unknown;
}

/**
 * Pixel events table - stores all tracking events from public profiles
 * Events are forwarded server-side to creator pixels and Jovie's marketing pixels
 */
export const pixelEvents = pgTable(
  'pixel_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Profile this event is for
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

    // Anonymous session tracking (cookie-based, not PII)
    sessionId: text('session_id').notNull(),

    // Event details
    eventType: pixelEventTypeEnum('event_type').notNull(),
    eventData: jsonb('event_data').$type<PixelEventData>().default({}),

    // Consent tracking
    consentGiven: boolean('consent_given').notNull().default(false),

    // Visitor info for forwarding to ad platforms
    // Raw IP is stored temporarily for ad platform matching (Facebook CAPI, TikTok Events API)
    // IP hash is kept for analytics and deduplication
    clientIp: text('client_ip'), // Raw IP for ad platform forwarding
    ipHash: text('ip_hash'), // Hashed IP for analytics
    userAgent: text('user_agent'),

    // Forwarding status - tracks which platforms have received this event
    forwardingStatus: jsonb('forwarding_status')
      .$type<PixelForwardingStatus>()
      .default({}),

    // When event should be forwarded (for batching/queuing)
    forwardAt: timestamp('forward_at').defaultNow().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Index for querying events by profile
    profileIdIdx: index('idx_pixel_events_profile_id').on(table.profileId),

    // Index for forwarding queue - find events that need forwarding
    forwardingQueueIdx: index('idx_pixel_events_forwarding_queue').on(
      table.forwardAt,
      table.createdAt
    ),

    // Index for session-based queries
    sessionIdIdx: index('idx_pixel_events_session_id').on(table.sessionId),

    // Index for recent events by profile (analytics)
    profileRecentIdx: index('idx_pixel_events_profile_recent').on(
      table.profileId,
      table.createdAt
    ),
  })
);

/**
 * Creator pixel configurations - stores API credentials for server-side forwarding
 * Access tokens are encrypted at rest using PII encryption
 */
export const creatorPixels = pgTable(
  'creator_pixels',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // One pixel config per profile
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

    // Facebook Conversions API
    facebookPixelId: text('facebook_pixel_id'),
    facebookAccessToken: text('facebook_access_token'), // Encrypted

    // Google Measurement Protocol
    googleMeasurementId: text('google_measurement_id'), // G-XXXXXX or AW-XXXXXX
    googleApiSecret: text('google_api_secret'), // Encrypted

    // TikTok Events API
    tiktokPixelId: text('tiktok_pixel_id'),
    tiktokAccessToken: text('tiktok_access_token'), // Encrypted

    // Master enable/disable
    enabled: boolean('enabled').default(true).notNull(),

    // Per-platform toggles
    facebookEnabled: boolean('facebook_enabled').default(true).notNull(),
    googleEnabled: boolean('google_enabled').default(true).notNull(),
    tiktokEnabled: boolean('tiktok_enabled').default(true).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // One pixel config per profile
    profileIdUnique: uniqueIndex('idx_creator_pixels_profile_id_unique').on(
      table.profileId
    ),

    // Index for finding enabled configs during forwarding
    enabledIdx: index('idx_creator_pixels_enabled')
      .on(table.enabled, table.profileId)
      .where(sql`enabled = true`),
  })
);

// Schema validations
export const insertPixelEventSchema = createInsertSchema(pixelEvents);
export const selectPixelEventSchema = createSelectSchema(pixelEvents);

export const insertCreatorPixelSchema = createInsertSchema(creatorPixels);
export const selectCreatorPixelSchema = createSelectSchema(creatorPixels);

// Types
export type PixelEvent = typeof pixelEvents.$inferSelect;
export type NewPixelEvent = typeof pixelEvents.$inferInsert;

export type CreatorPixel = typeof creatorPixels.$inferSelect;
export type NewCreatorPixel = typeof creatorPixels.$inferInsert;
