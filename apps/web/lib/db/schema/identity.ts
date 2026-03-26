/**
 * Artist Identity Links — Raw cross-platform identity layer.
 *
 * Stores EVERYTHING any enrichment source returns about an artist's external
 * presence. Multiple sources (MusicFetch, MusicBrainz, SERP) can contribute
 * data for the same platform. A separate "publish" step promotes qualifying
 * links into social_links (the product state table).
 *
 * Follows the same raw→promote pattern as creatorAvatarCandidates.
 */

import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { creatorProfiles } from './profiles';

export const artistIdentityLinks = pgTable(
  'artist_identity_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

    /** DSP registry key (e.g. 'spotify', 'apple_music', 'deezer') */
    platform: text('platform').notNull(),

    /** Raw URL as returned by the enrichment source */
    url: text('url').notNull(),

    /** Platform-specific ID if extractable (e.g. Spotify artist ID) */
    externalId: text('external_id'),

    /** Which enrichment source provided this data */
    source: text('source').notNull(),

    /** The input URL/query that triggered the lookup */
    sourceRequestUrl: text('source_request_url'),

    /** Full service object from the API response — never lose data */
    rawPayload: jsonb('raw_payload')
      .$type<Record<string, unknown>>()
      .default({}),

    /** When this data was fetched from the source */
    fetchedAt: timestamp('fetched_at').defaultNow().notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    /** One row per (profile, source, platform) — upsert on re-enrichment */
    profileSourcePlatformUnique: uniqueIndex(
      'ail_profile_source_platform_uniq'
    ).on(table.creatorProfileId, table.source, table.platform),

    /** Find all raw links for a profile (the publishing query) */
    profileIdx: index('ail_profile_idx').on(
      table.creatorProfileId,
      table.fetchedAt
    ),

    /** Find all sources for a platform across profiles (analytics) */
    platformSourceIdx: index('ail_platform_source_idx').on(
      table.platform,
      table.source
    ),
  })
);

// Schema validations
export const insertArtistIdentityLinkSchema =
  createInsertSchema(artistIdentityLinks);
export const selectArtistIdentityLinkSchema =
  createSelectSchema(artistIdentityLinks);

// Types
export type ArtistIdentityLink = typeof artistIdentityLinks.$inferSelect;
export type NewArtistIdentityLink = typeof artistIdentityLinks.$inferInsert;
