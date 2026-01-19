import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import {
  contentSlugTypeEnum,
  discogReleaseTypeEnum,
  ingestionSourceTypeEnum,
  providerKindEnum,
  providerLinkOwnerEnum,
} from './enums';
import { creatorProfiles } from './profiles';

// Providers table (music streaming, video, social, retail)
export const providers = pgTable('providers', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  kind: providerKindEnum('kind').notNull().default('music_streaming'),
  baseUrl: text('base_url'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Discography releases table
export const discogReleases = pgTable(
  'discog_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    releaseType: discogReleaseTypeEnum('release_type')
      .notNull()
      .default('single'),
    releaseDate: timestamp('release_date'),
    label: text('label'),
    upc: text('upc'),
    totalTracks: integer('total_tracks').default(0).notNull(),
    isExplicit: boolean('is_explicit').default(false).notNull(),
    artworkUrl: text('artwork_url'),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorSlugUnique: uniqueIndex('discog_releases_creator_slug_unique').on(
      table.creatorProfileId,
      table.slug
    ),
    creatorUpcUnique: uniqueIndex('discog_releases_creator_upc_unique')
      .on(table.creatorProfileId, table.upc)
      .where(drizzleSql`upc IS NOT NULL`),
    releaseDateIndex: index('discog_releases_release_date_idx').on(
      table.releaseDate
    ),
  })
);

// Discography tracks table
export const discogTracks = pgTable(
  'discog_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    durationMs: integer('duration_ms'),
    trackNumber: integer('track_number').notNull(),
    discNumber: integer('disc_number').default(1).notNull(),
    isExplicit: boolean('is_explicit').default(false).notNull(),
    isrc: text('isrc'),
    previewUrl: text('preview_url'),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseTrackPositionUnique: uniqueIndex(
      'discog_tracks_release_track_position_unique'
    ).on(table.releaseId, table.discNumber, table.trackNumber),
    releaseSlugUnique: uniqueIndex('discog_tracks_release_slug_unique').on(
      table.releaseId,
      table.slug
    ),
    trackIsrcUnique: uniqueIndex('discog_tracks_isrc_unique')
      .on(table.isrc)
      .where(drizzleSql`isrc IS NOT NULL`),
    releaseIndex: index('discog_tracks_release_id_idx').on(table.releaseId),
    creatorIndex: index('discog_tracks_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
  })
);

// Provider links table (links releases/tracks to streaming providers)
export const providerLinks = pgTable(
  'provider_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),
    ownerType: providerLinkOwnerEnum('owner_type').notNull(),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    externalId: text('external_id'),
    url: text('url').notNull(),
    country: text('country'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseProviderUnique: uniqueIndex('provider_links_release_provider').on(
      table.providerId,
      table.releaseId
    ),
    trackProviderUnique: uniqueIndex('provider_links_track_provider').on(
      table.providerId,
      table.trackId
    ),
    providerExternalUnique: uniqueIndex('provider_links_provider_external')
      .on(table.providerId, table.externalId)
      .where(drizzleSql`external_id IS NOT NULL`),
    releaseIndex: index('provider_links_release_id_idx').on(table.releaseId),
    trackIndex: index('provider_links_track_id_idx').on(table.trackId),
    ownerConstraint: check(
      'provider_links_owner_match',
      drizzleSql`
        (owner_type = 'release' AND release_id IS NOT NULL AND track_id IS NULL)
        OR (owner_type = 'track' AND track_id IS NOT NULL AND release_id IS NULL)
      `
    ),
  })
);

// Smart link targets table
export const smartLinkTargets = pgTable(
  'smart_link_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    smartLinkSlug: text('smart_link_slug').notNull(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),
    providerLinkId: uuid('provider_link_id').references(
      () => providerLinks.id,
      {
        onDelete: 'set null',
      }
    ),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    url: text('url').notNull(),
    isFallback: boolean('is_fallback').default(false).notNull(),
    priority: integer('priority').default(0).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    slugProviderUnique: uniqueIndex('smart_link_targets_slug_provider').on(
      table.creatorProfileId,
      table.smartLinkSlug,
      table.providerId
    ),
    providerLinkIndex: index('smart_link_targets_provider_link_idx').on(
      table.providerLinkId
    ),
    releaseIndex: index('smart_link_targets_release_id_idx').on(
      table.releaseId
    ),
    trackIndex: index('smart_link_targets_track_id_idx').on(table.trackId),
    ownerConstraint: check(
      'smart_link_targets_owner_match',
      drizzleSql`
        (release_id IS NOT NULL AND track_id IS NULL)
        OR (track_id IS NOT NULL AND release_id IS NULL)
      `
    ),
  })
);

// Content slug redirects table (for tracking old slugs when users edit them)
export const contentSlugRedirects = pgTable(
  'content_slug_redirects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    oldSlug: text('old_slug').notNull(),
    contentType: contentSlugTypeEnum('content_type').notNull(),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Unique old slug per creator (prevents reusing old slugs)
    creatorOldSlugUnique: uniqueIndex(
      'content_slug_redirects_creator_old_slug'
    ).on(table.creatorProfileId, table.oldSlug),
    // Index for fast lookup by old slug
    oldSlugIndex: index('content_slug_redirects_old_slug_idx').on(
      table.oldSlug
    ),
    // Ensure content reference matches content type
    contentConstraint: check(
      'content_slug_redirects_content_match',
      drizzleSql`
        (content_type = 'release' AND release_id IS NOT NULL AND track_id IS NULL)
        OR (content_type = 'track' AND track_id IS NOT NULL AND release_id IS NULL)
      `
    ),
  })
);

// Schema validations
export const insertProviderSchema = createInsertSchema(providers);
export const selectProviderSchema = createSelectSchema(providers);

export const insertDiscogReleaseSchema = createInsertSchema(discogReleases);
export const selectDiscogReleaseSchema = createSelectSchema(discogReleases);

export const insertDiscogTrackSchema = createInsertSchema(discogTracks);
export const selectDiscogTrackSchema = createSelectSchema(discogTracks);

export const insertProviderLinkSchema = createInsertSchema(providerLinks);
export const selectProviderLinkSchema = createSelectSchema(providerLinks);

export const insertSmartLinkTargetSchema = createInsertSchema(smartLinkTargets);
export const selectSmartLinkTargetSchema = createSelectSchema(smartLinkTargets);

export const insertContentSlugRedirectSchema =
  createInsertSchema(contentSlugRedirects);
export const selectContentSlugRedirectSchema =
  createSelectSchema(contentSlugRedirects);

// Types
export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type DiscogRelease = typeof discogReleases.$inferSelect;
export type NewDiscogRelease = typeof discogReleases.$inferInsert;

export type DiscogTrack = typeof discogTracks.$inferSelect;
export type NewDiscogTrack = typeof discogTracks.$inferInsert;

export type ProviderLink = typeof providerLinks.$inferSelect;
export type NewProviderLink = typeof providerLinks.$inferInsert;

export type SmartLinkTarget = typeof smartLinkTargets.$inferSelect;
export type NewSmartLinkTarget = typeof smartLinkTargets.$inferInsert;

export type ContentSlugRedirect = typeof contentSlugRedirects.$inferSelect;
export type NewContentSlugRedirect = typeof contentSlugRedirects.$inferInsert;
