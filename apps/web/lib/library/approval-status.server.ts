import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getDeepErrorMessage, unwrapPgError } from '@/lib/db/errors';
import { libraryAssetApprovalStatuses } from '@/lib/db/schema/library';
import { captureWarning } from '@/lib/error-tracking';
import type { LibraryApprovalStatus } from './approval-status';
import { DEFAULT_LIBRARY_APPROVAL_STATUS } from './approval-status';

/**
 * True when Postgres reports the `library_asset_approval_statuses` relation
 * is missing — migration 0058 shipped ahead of prod (migration-drift class,
 * JOV-3359). Drizzle surfaces these as "Failed query: ..." with the
 * underlying PG error (42P01 undefined_table) on `.cause`.
 */
export function isMissingLibraryApprovalStatusTableError(
  error: unknown
): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (
    !message.includes('does not exist') &&
    unwrapPgError(error).code !== '42P01'
  ) {
    return false;
  }

  return message.includes('library_asset_approval_statuses');
}

export async function getLibraryApprovalStatusMapForProfile(
  creatorProfileId: string
): Promise<ReadonlyMap<string, LibraryApprovalStatus>> {
  try {
    const rows = await db
      .select({
        assetId: libraryAssetApprovalStatuses.assetId,
        approvalStatus: libraryAssetApprovalStatuses.approvalStatus,
      })
      .from(libraryAssetApprovalStatuses)
      .where(
        eq(libraryAssetApprovalStatuses.creatorProfileId, creatorProfileId)
      );

    return new Map(rows.map(row => [row.assetId, row.approvalStatus] as const));
  } catch (error) {
    // Migration drift (JOV-3359): degrade to "no explicit statuses" so every
    // asset renders at its documented default instead of 500-ing the Library
    // page. Only the missing-relation class degrades; every other error
    // still throws.
    if (!isMissingLibraryApprovalStatusTableError(error)) {
      throw error;
    }
    await captureWarning(
      '[library] library_asset_approval_statuses relation missing (migration drift); treating all assets as default approval status',
      error,
      { creatorProfileId }
    );
    return new Map();
  }
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
