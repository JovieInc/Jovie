import { inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { profilePhotos } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  buildOrphanedRecordsWhereClause,
  collectBlobUrls,
  deleteBlobsIfConfigured,
  verifyCronAuth,
} from './helpers';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for cleanup

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Cleanup thresholds
const FAILED_RECORD_MAX_AGE_HOURS = 24;
const UPLOADING_RECORD_MAX_AGE_HOURS = 1; // Stuck uploads older than 1 hour

/**
 * Core logic for cleaning up orphaned photos.
 * Exported for use by the consolidated /api/cron/daily-maintenance handler.
 */
export async function cleanupOrphanedPhotos(): Promise<{
  deleted: number;
  blobsDeleted: number;
}> {
  const now = new Date();
  const failedCutoff = new Date(
    now.getTime() - FAILED_RECORD_MAX_AGE_HOURS * 60 * 60 * 1000
  );
  const stuckCutoff = new Date(
    now.getTime() - UPLOADING_RECORD_MAX_AGE_HOURS * 60 * 60 * 1000
  );

  const orphanedRecords = await db
    .select({
      id: profilePhotos.id,
      status: profilePhotos.status,
      blobUrl: profilePhotos.blobUrl,
      smallUrl: profilePhotos.smallUrl,
      mediumUrl: profilePhotos.mediumUrl,
      largeUrl: profilePhotos.largeUrl,
      createdAt: profilePhotos.createdAt,
    })
    .from(profilePhotos)
    .where(buildOrphanedRecordsWhereClause(failedCutoff, stuckCutoff))
    .limit(100);

  if (orphanedRecords.length === 0) {
    return { deleted: 0, blobsDeleted: 0 };
  }

  const blobUrlsToDelete = collectBlobUrls(orphanedRecords);
  const blobsDeleted = await deleteBlobsIfConfigured(blobUrlsToDelete);

  // If blob deletion failed, skip DB record deletion to avoid orphaning blobs
  if (blobsDeleted < 0 && blobUrlsToDelete.length > 0) {
    logger.warn(
      `[cleanup-photos] Skipping DB record deletion — blob cleanup failed for ${blobUrlsToDelete.length} URLs`
    );
    throw new Error(`Blob deletion failed for ${blobUrlsToDelete.length} URLs`);
  }

  const recordIds = orphanedRecords.map(r => r.id);
  if (recordIds.length > 0) {
    await db.delete(profilePhotos).where(inArray(profilePhotos.id, recordIds));
  }

  logger.info(
    `[cleanup-photos] Deleted ${recordIds.length} orphaned records, ${blobsDeleted} blobs`
  );

  return { deleted: recordIds.length, blobsDeleted };
}

/**
 * Cron job to clean up orphaned profile_photos records.
 *
 * Schedule: Daily at 3:00 AM UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request, process.env.CRON_SECRET);
  if (authError) return authError;

  try {
    const result = await cleanupOrphanedPhotos();

    return NextResponse.json(
      {
        success: true,
        message:
          result.deleted === 0
            ? 'No orphaned records found'
            : `Cleaned up ${result.deleted} orphaned photo records`,
        deleted: result.deleted,
        blobsDeleted: result.blobsDeleted,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[cleanup-photos] Cleanup failed:', error);
    await captureError('Photo cleanup cron failed', error, {
      route: '/api/cron/cleanup-photos',
      method: 'GET',
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
