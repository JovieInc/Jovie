import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { libraryAssetApprovalStatuses } from '@/lib/db/schema/library';
import type { LibraryApprovalStatus } from './approval-status';
import { DEFAULT_LIBRARY_APPROVAL_STATUS } from './approval-status';

export async function getLibraryApprovalStatusMapForProfile(
  creatorProfileId: string
): Promise<ReadonlyMap<string, LibraryApprovalStatus>> {
  const rows = await db
    .select({
      assetId: libraryAssetApprovalStatuses.assetId,
      approvalStatus: libraryAssetApprovalStatuses.approvalStatus,
    })
    .from(libraryAssetApprovalStatuses)
    .where(eq(libraryAssetApprovalStatuses.creatorProfileId, creatorProfileId));

  return new Map(rows.map(row => [row.assetId, row.approvalStatus] as const));
}

export async function upsertLibraryApprovalStatus(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly itemKind: string;
  readonly approvalStatus: LibraryApprovalStatus;
}): Promise<LibraryApprovalStatus> {
  const [row] = await db
    .insert(libraryAssetApprovalStatuses)
    .values({
      creatorProfileId: input.creatorProfileId,
      assetId: input.assetId,
      itemKind: input.itemKind,
      approvalStatus: input.approvalStatus,
    })
    .onConflictDoUpdate({
      target: [
        libraryAssetApprovalStatuses.creatorProfileId,
        libraryAssetApprovalStatuses.assetId,
      ],
      set: {
        approvalStatus: input.approvalStatus,
        itemKind: input.itemKind,
        updatedAt: new Date(),
      },
    })
    .returning({
      approvalStatus: libraryAssetApprovalStatuses.approvalStatus,
    });

  return row?.approvalStatus ?? input.approvalStatus;
}

export async function getLibraryApprovalStatusForAsset(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
}): Promise<LibraryApprovalStatus> {
  const [row] = await db
    .select({
      approvalStatus: libraryAssetApprovalStatuses.approvalStatus,
    })
    .from(libraryAssetApprovalStatuses)
    .where(
      and(
        eq(
          libraryAssetApprovalStatuses.creatorProfileId,
          input.creatorProfileId
        ),
        eq(libraryAssetApprovalStatuses.assetId, input.assetId)
      )
    )
    .limit(1);

  return row?.approvalStatus ?? DEFAULT_LIBRARY_APPROVAL_STATUS;
}
