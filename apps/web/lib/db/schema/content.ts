import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
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
import {
  artistRoleEnum,
  artistTypeEnum,
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
    status: text('status').notNull().default('released'),
    revealDate: timestamp('reveal_date'),
    deletedAt: timestamp('deleted_at'),
    label: text('label'),
    upc: text('upc'),
    totalTracks: integer('total_tracks').default(0).notNull(),
    isExplicit: boolean('is_explicit').default(false).notNull(),
    genres: text('genres').array(),
    targetPlaylists: text('target_playlists').array(),
    copyrightLine: text('copyright_line'),
    distributor: text('distributor'),
    artworkUrl: text('artwork_url'),
    spotifyPopularity: integer('spotify_popularity'),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    generatedPitches: jsonb('generated_pitches').$type<{
      spotify: string;
      amazon: string;
      appleMusic: string;
      generic: string;
      generatedAt: string;
      modelUsed: string;
    }>(),
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
    spotifyPopularityRange: check(
      'discog_releases_spotify_popularity_range',
      drizzleSql`spotify_popularity >= 0 AND spotify_popularity <= 100`
    ),
  })
);

// Discography recordings table (canonical audio entity — MusicBrainz "recording")
export const discogRecordings = pgTable(
  'discog_recordings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    isrc: text('isrc'),
    durationMs: integer('duration_ms'),
    isExplicit: boolean('is_explicit').default(false).notNull(),
    previewUrl: text('preview_url'),
    audioUrl: text('audio_url'),
    audioFormat: text('audio_format'),
    lyrics: text('lyrics'),
    waveformPeaks: jsonb('waveform_peaks').$type<number[]>(),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorSlugUnique: uniqueIndex('discog_recordings_creator_slug_unique').on(
      table.creatorProfileId,
      table.slug
    ),
    creatorIsrcUnique: uniqueIndex('discog_recordings_creator_isrc_unique')
      .on(table.creatorProfileId, table.isrc)
      .where(drizzleSql`isrc IS NOT NULL`),
    creatorIndex: index('discog_recordings_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
  })
);

// Discography release tracks table (recording appearance on a release — MusicBrainz "track")
export const discogReleaseTracks = pgTable(
  'discog_release_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    recordingId: uuid('recording_id')
      .notNull()
      .references(() => discogRecordings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    trackNumber: integer('track_number').notNull(),
    discNumber: integer('disc_number').default(1).notNull(),
    isExplicit: boolean('is_explicit').default(false).notNull(),
    sourceType: ingestionSourceTypeEnum('source_type')
      .default('manual')
      .notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseTrackPositionUnique: uniqueIndex(
      'discog_release_tracks_position_unique'
    ).on(table.releaseId, table.discNumber, table.trackNumber),
    releaseSlugUnique: uniqueIndex(
      'discog_release_tracks_release_slug_unique'
    ).on(table.releaseId, table.slug),
    releaseIndex: index('discog_release_tracks_release_id_idx').on(
      table.releaseId
    ),
    recordingIndex: index('discog_release_tracks_recording_id_idx').on(
      table.recordingId
    ),
  })
);

// Discography tracks table (LEGACY — kept for migration safety, stop writing to this)
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
    audioUrl: text('audio_url'),
    audioFormat: text('audio_format'),
    previewUrl: text('preview_url'),
    lyrics: text('lyrics'),
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
    releaseIsrcUnique: uniqueIndex('discog_tracks_release_isrc_unique')
      .on(table.releaseId, table.isrc)
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
    releaseTrackId: uuid('release_track_id').references(
      () => discogReleaseTracks.id,
      { onDelete: 'cascade' }
    ),
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
    releaseTrackProviderUnique: uniqueIndex(
      'provider_links_release_track_provider'
    ).on(table.providerId, table.releaseTrackId),
    providerExternalUnique: uniqueIndex('provider_links_provider_external')
      .on(table.providerId, table.externalId)
      .where(drizzleSql`external_id IS NOT NULL`),
    releaseIndex: index('provider_links_release_id_idx').on(table.releaseId),
    trackIndex: index('provider_links_track_id_idx').on(table.trackId),
    releaseTrackIndex: index('provider_links_release_track_id_idx').on(
      table.releaseTrackId
    ),
    ownerConstraint: check(
      'provider_links_owner_match',
      drizzleSql`
        (owner_type::text = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
        OR (owner_type::text = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
        OR (owner_type::text = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
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
    releaseTrackId: uuid('release_track_id').references(
      () => discogReleaseTracks.id,
      { onDelete: 'cascade' }
    ),
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
    releaseTrackIndex: index('smart_link_targets_release_track_id_idx').on(
      table.releaseTrackId
    ),
    ownerConstraint: check(
      'smart_link_targets_owner_match',
      drizzleSql`
        (release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
        OR (track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
        OR (release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
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
    releaseTrackId: uuid('release_track_id').references(
      () => discogReleaseTracks.id,
      { onDelete: 'cascade' }
    ),
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
        (content_type::text = 'release' AND release_id IS NOT NULL AND track_id IS NULL AND release_track_id IS NULL)
        OR (content_type::text = 'track' AND track_id IS NOT NULL AND release_id IS NULL AND release_track_id IS NULL)
        OR (content_type::text = 'release_track' AND release_track_id IS NOT NULL AND release_id IS NULL AND track_id IS NULL)
      `
    ),
  })
);

// ============================================================================
// Multi-Artist Support Tables
// ============================================================================

/**
 * Canonical artist registry - stores all artists (both Jovie users and collaborators)
 *
 * This table serves as a registry of all artists in the system:
 * - Artists with Jovie accounts have a `creatorProfileId` reference
 * - Collaborators discovered during import are auto-created without accounts
 * - External IDs (Spotify, Apple Music, etc.) enable cross-platform matching
 */
export const artists = pgTable(
  'artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Links to Jovie account if artist is a user (nullable for external collaborators)
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(), // lowercase, no special chars
    sortName: text('sort_name'), // "Beatles, The" for sorting
    disambiguation: text('disambiguation'), // "UK electronic producer"
    artistType: artistTypeEnum('artist_type').default('person'),

    // External platform IDs for cross-platform matching
    spotifyId: text('spotify_id'),
    appleMusicId: text('apple_music_id'),
    musicbrainzId: text('musicbrainz_id'),
    deezerId: text('deezer_id'),

    // Profile data
    imageUrl: text('image_url'),

    // Auto-creation tracking
    isAutoCreated: boolean('is_auto_created').default(false).notNull(),
    matchConfidence: decimal('match_confidence', { precision: 5, scale: 4 }), // 0.0000-1.0000

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique external IDs (partial indexes - only when not null)
    spotifyIdUnique: uniqueIndex('artists_spotify_id_unique')
      .on(table.spotifyId)
      .where(drizzleSql`spotify_id IS NOT NULL`),
    appleMusicIdUnique: uniqueIndex('artists_apple_music_id_unique')
      .on(table.appleMusicId)
      .where(drizzleSql`apple_music_id IS NOT NULL`),
    musicbrainzIdUnique: uniqueIndex('artists_musicbrainz_id_unique')
      .on(table.musicbrainzId)
      .where(drizzleSql`musicbrainz_id IS NOT NULL`),
    deezerIdUnique: uniqueIndex('artists_deezer_id_unique')
      .on(table.deezerId)
      .where(drizzleSql`deezer_id IS NOT NULL`),

    // Search & lookup indexes
    nameNormalizedIndex: index('artists_name_normalized_idx').on(
      table.nameNormalized
    ),
    creatorProfileIndex: index('artists_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
  })
);

/**
 * Track-Artist junction table - links tracks to artists with roles
 *
 * Supports multiple artists per track with different roles:
 * - main_artist: Primary credited artist
 * - featured_artist: "feat." credit
 * - remixer: "(X Remix)" credit
 * - producer, composer, etc.
 */
export const trackArtists = pgTable(
  'track_artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => discogTracks.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    role: artistRoleEnum('role').notNull(),

    // Display customization
    creditName: text('credit_name'), // Display name override (e.g., stage name)
    joinPhrase: text('join_phrase'), // " feat. ", " & ", " x ", etc.
    position: integer('position').default(0).notNull(), // Order in credit list

    isPrimary: boolean('is_primary').default(false).notNull(),
    sourceType: ingestionSourceTypeEnum('source_type').default('ingested'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Prevent duplicate artist-role on same track
    trackArtistRoleUnique: uniqueIndex('track_artists_track_artist_role').on(
      table.trackId,
      table.artistId,
      table.role
    ),
    artistIndex: index('track_artists_artist_id_idx').on(table.artistId),
    trackIndex: index('track_artists_track_id_idx').on(table.trackId),
  })
);

/**
 * Recording-Artist junction table - links recordings to artists with roles
 *
 * Parallel to track_artists but for the canonical recording entity.
 */
export const recordingArtists = pgTable(
  'recording_artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordingId: uuid('recording_id')
      .notNull()
      .references(() => discogRecordings.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    role: artistRoleEnum('role').notNull(),

    // Display customization
    creditName: text('credit_name'),
    joinPhrase: text('join_phrase'),
    position: integer('position').default(0).notNull(),

    isPrimary: boolean('is_primary').default(false).notNull(),
    sourceType: ingestionSourceTypeEnum('source_type').default('ingested'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    recordingArtistRoleUnique: uniqueIndex(
      'recording_artists_recording_artist_role'
    ).on(table.recordingId, table.artistId, table.role),
    artistIndex: index('recording_artists_artist_id_idx').on(table.artistId),
    recordingIndex: index('recording_artists_recording_id_idx').on(
      table.recordingId
    ),
  })
);

/**
 * Release-Artist junction table - links releases to artists with roles
 *
 * Similar to track_artists but at the release level for album credits.
 */
export const releaseArtists = pgTable(
  'release_artists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    role: artistRoleEnum('role').notNull(),

    // Display customization
    creditName: text('credit_name'),
    joinPhrase: text('join_phrase'),
    position: integer('position').default(0).notNull(),

    isPrimary: boolean('is_primary').default(false).notNull(),
    sourceType: ingestionSourceTypeEnum('source_type').default('ingested'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    // Prevent duplicate artist-role on same release
    releaseArtistRoleUnique: uniqueIndex(
      'release_artists_release_artist_role'
    ).on(table.releaseId, table.artistId, table.role),
    artistIndex: index('release_artists_artist_id_idx').on(table.artistId),
    releaseIndex: index('release_artists_release_id_idx').on(table.releaseId),
  })
);

// ============================================================================
// Schema Validations
// ============================================================================

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

// Multi-Artist Support Schemas
export const insertArtistSchema = createInsertSchema(artists);
export const selectArtistSchema = createSelectSchema(artists);

export const insertTrackArtistSchema = createInsertSchema(trackArtists);
export const selectTrackArtistSchema = createSelectSchema(trackArtists);

export const insertReleaseArtistSchema = createInsertSchema(releaseArtists);
export const selectReleaseArtistSchema = createSelectSchema(releaseArtists);

// Multi-Artist Support Types
export type Artist = typeof artists.$inferSelect;
export type NewArtist = typeof artists.$inferInsert;

export type TrackArtist = typeof trackArtists.$inferSelect;
export type NewTrackArtist = typeof trackArtists.$inferInsert;

export type ReleaseArtist = typeof releaseArtists.$inferSelect;
export type NewReleaseArtist = typeof releaseArtists.$inferInsert;

// Recording schemas & types
export const insertDiscogRecordingSchema = createInsertSchema(discogRecordings);
export const selectDiscogRecordingSchema = createSelectSchema(discogRecordings);

export type DiscogRecording = typeof discogRecordings.$inferSelect;
export type NewDiscogRecording = typeof discogRecordings.$inferInsert;

// Release track schemas & types
export const insertDiscogReleaseTrackSchema =
  createInsertSchema(discogReleaseTracks);
export const selectDiscogReleaseTrackSchema =
  createSelectSchema(discogReleaseTracks);

export type DiscogReleaseTrack = typeof discogReleaseTracks.$inferSelect;
export type NewDiscogReleaseTrack = typeof discogReleaseTracks.$inferInsert;

// Recording artist schemas & types
export const insertRecordingArtistSchema = createInsertSchema(recordingArtists);
export const selectRecordingArtistSchema = createSelectSchema(recordingArtists);

export type RecordingArtist = typeof recordingArtists.$inferSelect;
export type NewRecordingArtist = typeof recordingArtists.$inferInsert;

// Enum value types (for type-safe use in queries and functions)
export type ArtistRole = (typeof artistRoleEnum.enumValues)[number];
export type ArtistType = (typeof artistTypeEnum.enumValues)[number];
