import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { libraryAssetApprovalStatuses } from '@/lib/db/schema/library';
import type { LibraryApprovalStatus } from './approval-status';
import type {
  LibraryProfileItemKind,
  LibraryProfileVisibility,
} from './profile-visibility';

export interface LibraryProfileState {
  readonly approvalStatus: LibraryApprovalStatus;
  readonly profileVisibility: LibraryProfileVisibility;
}

export async function getLibraryProfileStateMapForProfile(
  creatorProfileId: string
): Promise<ReadonlyMap<string, LibraryProfileState>> {
  const rows = await db
    .select({
      assetId: libraryAssetApprovalStatuses.assetId,
      approvalStatus: libraryAssetApprovalStatuses.approvalStatus,
      profileVisibility: libraryAssetApprovalStatuses.profileVisibility,
    })
    .from(libraryAssetApprovalStatuses)
    .where(eq(libraryAssetApprovalStatuses.creatorProfileId, creatorProfileId));

  return new Map(
    rows.map(
      row =>
        [
          row.assetId,
          {
            approvalStatus: row.approvalStatus,
            profileVisibility: row.profileVisibility,
          },
        ] as const
    )
  );
}

export async function upsertLibraryProfileVisibility(input: {
  readonly creatorProfileId: string;
  readonly assetId: string;
  readonly itemKind: LibraryProfileItemKind;
  readonly profileVisibility: LibraryProfileVisibility;
}): Promise<LibraryProfileVisibility> {
  const [row] = await db
    .insert(libraryAssetApprovalStatuses)
    .values({
      creatorProfileId: input.creatorProfileId,
      assetId: input.assetId,
      itemKind: input.itemKind,
      profileVisibility: input.profileVisibility,
    })
    .onConflictDoUpdate({
      target: [
        libraryAssetApprovalStatuses.creatorProfileId,
        libraryAssetApprovalStatuses.assetId,
      ],
      set: {
        itemKind: input.itemKind,
        profileVisibility: input.profileVisibility,
        updatedAt: new Date(),
      },
    })
    .returning({
      profileVisibility: libraryAssetApprovalStatuses.profileVisibility,
    });

  return row?.profileVisibility ?? input.profileVisibility;
}
