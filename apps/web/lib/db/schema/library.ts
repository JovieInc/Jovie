import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { libraryAssetApprovalStatusEnum } from './enums';
import { creatorProfiles } from './profiles';

export type LibraryAssetApprovalStatusValue =
  (typeof libraryAssetApprovalStatusEnum.enumValues)[number];

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
