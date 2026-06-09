import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type LibraryAssetApprovalStatusValue,
  libraryAssetApprovalStatuses,
} from '@/lib/db/schema/library';

export type LibraryApprovalStatus = LibraryAssetApprovalStatusValue;

export const LIBRARY_APPROVAL_STATUSES = [
  'draft',
  'needs_review',
  'approved',
  'archived',
] as const satisfies readonly LibraryApprovalStatus[];

export const DEFAULT_LIBRARY_APPROVAL_STATUS: LibraryApprovalStatus = 'draft';

export function isLibraryApprovalStatus(
  value: string
): value is LibraryApprovalStatus {
  return (LIBRARY_APPROVAL_STATUSES as readonly string[]).includes(value);
}

export function formatLibraryApprovalStatus(
  status: LibraryApprovalStatus
): string {
  return status
    .split('_')
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function libraryApprovalStatusClasses(
  status: LibraryApprovalStatus
): string {
  if (status === 'approved') {
    return 'border-success/20 bg-success/10 text-success';
  }
  if (status === 'needs_review') {
    return 'border-warning/20 bg-warning/10 text-warning';
  }
  if (status === 'archived') {
    return 'border-subtle bg-surface-1 text-tertiary-token';
  }
  return 'border-subtle bg-surface-1 text-secondary-token';
}

export function libraryApprovalStatusDotClasses(
  status: LibraryApprovalStatus
): string {
  if (status === 'approved') return 'bg-success';
  if (status === 'needs_review') return 'bg-warning';
  if (status === 'archived') return 'bg-tertiary-token';
  return 'bg-secondary-token';
}

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
