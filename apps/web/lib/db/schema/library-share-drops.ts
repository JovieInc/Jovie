import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { discogReleases } from './content';
import { creatorProfiles } from './profiles';

export const libraryShareDropLayoutEnum = pgEnum('library_share_drop_layout', [
  'grid',
  'list',
  'reel',
]);

/**
 * Curated, token-gated share portals for Library release assets.
 * Frame.io-style drops for press kits and label review.
 */
export const libraryShareDrops = pgTable(
  'library_share_drops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message'),
    layout: libraryShareDropLayoutEnum('layout').notNull().default('grid'),
    downloadsEnabled: boolean('downloads_enabled').notNull().default(true),
    /** scrypt salt:hash — null means no passphrase gate */
    passphraseHash: text('passphrase_hash'),
    expiresAt: timestamp('expires_at'),
    isActive: boolean('is_active').notNull().default(true),
    /** MVP ships default Jovie branding; paid tier overrides in phase 2 */
    accentColor: text('accent_color'),
    logoUrl: text('logo_url'),
    darkMode: boolean('dark_mode').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    tokenUnique: uniqueIndex('library_share_drops_token_unique').on(
      table.token
    ),
    profileIdx: index('library_share_drops_creator_profile_id_idx').on(
      table.creatorProfileId
    ),
    activeExpiresIdx: index('library_share_drops_active_expires_idx').on(
      table.isActive,
      table.expiresAt
    ),
  })
);

export const libraryShareDropItems = pgTable(
  'library_share_drop_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dropId: uuid('drop_id')
      .notNull()
      .references(() => libraryShareDrops.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    includeArtwork: boolean('include_artwork').notNull().default(true),
    includePreview: boolean('include_preview').notNull().default(true),
    includeLyrics: boolean('include_lyrics').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    dropPositionIdx: index('library_share_drop_items_drop_position_idx').on(
      table.dropId,
      table.position
    ),
    dropReleaseUnique: uniqueIndex(
      'library_share_drop_items_drop_release_unique'
    ).on(table.dropId, table.releaseId),
  })
);

export const insertLibraryShareDropSchema =
  createInsertSchema(libraryShareDrops);
export const selectLibraryShareDropSchema =
  createSelectSchema(libraryShareDrops);
export const insertLibraryShareDropItemSchema = createInsertSchema(
  libraryShareDropItems
);
export const selectLibraryShareDropItemSchema = createSelectSchema(
  libraryShareDropItems
);

export type LibraryShareDrop = typeof libraryShareDrops.$inferSelect;
export type NewLibraryShareDrop = typeof libraryShareDrops.$inferInsert;
export type LibraryShareDropItem = typeof libraryShareDropItems.$inferSelect;
export type NewLibraryShareDropItem = typeof libraryShareDropItems.$inferInsert;
export type LibraryShareDropLayout =
  (typeof libraryShareDropLayoutEnum.enumValues)[number];
