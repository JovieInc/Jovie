import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import {
  libraryAssetApprovalStatusEnum,
  libraryProfileVisibilityEnum,
} from './enums';
import { creatorProfiles } from './profiles';

export type LibraryAssetApprovalStatusValue =
  (typeof libraryAssetApprovalStatusEnum.enumValues)[number];

/**
 * Canonical per-asset publishing state.
 *
 * Approval status controls editorial readiness. Profile visibility controls
 * whether an otherwise eligible entity appears on the creator's public
 * profile. Share-link privacy is stored separately in
 * `library_asset_share_settings`.
 */
export const libraryAssetApprovalStatuses = pgTable(
  'library_asset_approval_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    assetId: text('asset_id').notNull(),
    itemKind: text('item_kind').notNull(),
    approvalStatus: libraryAssetApprovalStatusEnum('approval_status')
      .notNull()
      .default('draft'),
    profileVisibility: libraryProfileVisibilityEnum('profile_visibility')
      .notNull()
      .default('visible'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorAssetUnique: uniqueIndex(
      'library_asset_approval_statuses_creator_asset_unique'
    ).on(table.creatorProfileId, table.assetId),
    creatorStatusIdx: index(
      'library_asset_approval_statuses_creator_status_idx'
    ).on(table.creatorProfileId, table.approvalStatus),
    creatorProfileVisibilityIdx: index(
      'library_asset_approval_statuses_creator_profile_visibility_idx'
    ).on(table.creatorProfileId, table.profileVisibility),
  })
);

export type LibraryAssetApprovalStatusRow =
  typeof libraryAssetApprovalStatuses.$inferSelect;
export type NewLibraryAssetApprovalStatusRow =
  typeof libraryAssetApprovalStatuses.$inferInsert;

export const insertLibraryAssetApprovalStatusSchema = createInsertSchema(
  libraryAssetApprovalStatuses
);
export const selectLibraryAssetApprovalStatusSchema = createSelectSchema(
  libraryAssetApprovalStatuses
);
