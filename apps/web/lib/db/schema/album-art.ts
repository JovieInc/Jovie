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
import { discogReleases } from './content';
import { creatorProfiles } from './profiles';

export const artistBrandKits = pgTable(
  'artist_brand_kits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    layoutPreset: text('layout_preset')
      .notNull()
      .default('v1-title-artist-version'),
    logoAssetUrl: text('logo_asset_url'),
    logoPosition: text('logo_position').notNull().default('top-left'),
    logoOpacity: numeric('logo_opacity', { precision: 3, scale: 2 })
      .notNull()
      .default('1.00'),
    textStyleJson: jsonb('text_style_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    profileIndex: index('artist_brand_kits_profile_id_idx').on(table.profileId),
    defaultIndex: uniqueIndex('artist_brand_kits_profile_default_unique_idx')
      .on(table.profileId)
      .where(drizzleSql`${table.isDefault} = true`),
  })
);

export const albumArtGenerationSessions = pgTable(
  'album_art_generation_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'cascade',
    }),
    draftKey: text('draft_key'),
    mode: text('mode').notNull(),
    templateSourceType: text('template_source_type').notNull().default('none'),
    templateSourceId: uuid('template_source_id'),
    status: text('status').notNull().default('pending'),
    consumedRuns: integer('consumed_runs').notNull().default(0),
    expiresAt: timestamp('expires_at').notNull(),
    payloadJson: jsonb('payload_json')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    profileIndex: index('album_art_sessions_profile_id_idx').on(
      table.profileId
    ),
    releaseIndex: index('album_art_sessions_release_id_idx').on(
      table.releaseId
    ),
    draftIndex: index('album_art_sessions_draft_key_idx').on(table.draftKey),
    statusIndex: index('album_art_sessions_status_idx').on(
      table.profileId,
      table.status
    ),
    cleanupIndex: index('album_art_sessions_cleanup_idx')
      .on(table.expiresAt)
      .where(drizzleSql`${table.status} <> 'applied'`),
  })
);

export type ArtistBrandKit = typeof artistBrandKits.$inferSelect;
export type NewArtistBrandKit = typeof artistBrandKits.$inferInsert;
export type AlbumArtGenerationSession =
  typeof albumArtGenerationSessions.$inferSelect;
export type NewAlbumArtGenerationSession =
  typeof albumArtGenerationSessions.$inferInsert;

export const insertArtistBrandKitSchema = createInsertSchema(artistBrandKits);
export const selectArtistBrandKitSchema = createSelectSchema(artistBrandKits);
export const insertAlbumArtGenerationSessionSchema = createInsertSchema(
  albumArtGenerationSessions
);
export const selectAlbumArtGenerationSessionSchema = createSelectSchema(
  albumArtGenerationSessions
);
