import { inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, profilePhotos } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import {
  buildCleanupDetails,
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
 * Cron job to clean up orphaned profile_photos records:
 * - Failed uploads older than 24 hours
 * - Stuck "uploading" or "processing" records older than 1 hour
 *
 * Also attempts to delete associated blob storage files.
 *
 * Schedule: Daily at 3:00 AM UTC (configured in vercel.json)
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request, process.env.CRON_SECRET);
  if (authError) return authError;

  const now = new Date();
  const failedCutoff = new Date(
    now.getTime() - FAILED_RECORD_MAX_AGE_HOURS * 60 * 60 * 1000
  );
  const stuckCutoff = new Date(
    now.getTime() - UPLOADING_RECORD_MAX_AGE_HOURS * 60 * 60 * 1000
  );

  try {
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
      return NextResponse.json(
        {
          success: true,
          message: 'No orphaned records found',
          deleted: 0,
          blobsDeleted: 0,
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    const blobUrlsToDelete = collectBlobUrls(orphanedRecords);
    const blobsDeleted = await deleteBlobsIfConfigured(blobUrlsToDelete);

    // Delete database records in a single batch operation
    const recordIds = orphanedRecords.map(r => r.id);
    if (recordIds.length > 0) {
      await db
        .delete(profilePhotos)
        .where(inArray(profilePhotos.id, recordIds));
    }

    logger.info(
      `[cleanup-photos] Deleted ${recordIds.length} orphaned records, ${blobsDeleted} blobs`
    );

    return NextResponse.json(
      {
        success: true,
        message: `Cleaned up ${recordIds.length} orphaned photo records`,
        deleted: recordIds.length,
        blobsDeleted,
        details: buildCleanupDetails(orphanedRecords),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[cleanup-photos] Cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
