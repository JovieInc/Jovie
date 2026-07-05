import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { libraryAssetVisibilityEnum } from './enums';
import { creatorProfiles } from './profiles';

export type LibraryAssetVisibilityValue =
  (typeof libraryAssetVisibilityEnum.enumValues)[number];

/**
 * Per-asset share settings for Library items.
 * Every asset gets a stable slug + tokenized private link that can be revoked.
 */
export const libraryAssetShareSettings = pgTable(
  'library_asset_share_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    assetId: text('asset_id').notNull(),
    itemKind: text('item_kind').notNull(),
    visibility: libraryAssetVisibilityEnum('visibility')
      .notNull()
      .default('private'),
    /** Stable slug segment for public /a/{handle}/{shareSlug} URLs */
    shareSlug: text('share_slug').notNull(),
    /** Opaque token for private /p/{accessToken} URLs */
    accessToken: text('access_token').notNull(),
    /** When set, the current accessToken is invalid until regenerated */
    tokenRevokedAt: timestamp('token_revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorAssetUnique: uniqueIndex(
      'library_asset_share_settings_creator_asset_unique'
    ).on(table.creatorProfileId, table.assetId),
    creatorSlugUnique: uniqueIndex(
      'library_asset_share_settings_creator_slug_unique'
    ).on(table.creatorProfileId, table.shareSlug),
    accessTokenUnique: uniqueIndex(
      'library_asset_share_settings_access_token_unique'
    ).on(table.accessToken),
    creatorVisibilityIdx: index(
      'library_asset_share_settings_creator_visibility_idx'
    ).on(table.creatorProfileId, table.visibility),
  })
);

export type LibraryAssetShareSettingsRow =
  typeof libraryAssetShareSettings.$inferSelect;
export type NewLibraryAssetShareSettingsRow =
  typeof libraryAssetShareSettings.$inferInsert;

export const insertLibraryAssetShareSettingsSchema = createInsertSchema(
  libraryAssetShareSettings
);
export const selectLibraryAssetShareSettingsSchema = createSelectSchema(
  libraryAssetShareSettings
);
