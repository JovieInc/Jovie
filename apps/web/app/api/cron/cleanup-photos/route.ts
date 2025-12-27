import { del } from '@vercel/blob';
import crypto from 'node:crypto';
import { and, eq, inArray, lt, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, profilePhotos } from '@/lib/db';
import { captureWarning } from '@/lib/error-tracking';

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
  // Verify cron secret in production using timing-safe comparison
  if (process.env.NODE_ENV === 'production') {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');
    const providedSecret = authHeader?.replace('Bearer ', '');

    if (!cronSecret || !providedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Use timing-safe comparison to prevent timing attacks
    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(cronSecret);
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  const now = new Date();
  const failedCutoff = new Date(
    now.getTime() - FAILED_RECORD_MAX_AGE_HOURS * 60 * 60 * 1000
  );
  const stuckCutoff = new Date(
    now.getTime() - UPLOADING_RECORD_MAX_AGE_HOURS * 60 * 60 * 1000
  );

  try {
    // Find orphaned records
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
      .where(
        or(
          // Failed records older than 24 hours
          and(
            eq(profilePhotos.status, 'failed'),
            lt(profilePhotos.createdAt, failedCutoff)
          ),
          // Stuck uploading records older than 1 hour
          and(
            eq(profilePhotos.status, 'uploading'),
            lt(profilePhotos.createdAt, stuckCutoff)
          ),
          // Stuck processing records older than 1 hour
          and(
            eq(profilePhotos.status, 'processing'),
            lt(profilePhotos.createdAt, stuckCutoff)
          )
        )
      )
      .limit(100); // Process in batches to avoid timeout

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

    // Collect blob URLs to delete (deduplicated - same URL may appear in multiple columns)
    const blobUrlSet = new Set<string>();
    for (const record of orphanedRecords) {
      if (record.blobUrl) blobUrlSet.add(record.blobUrl);
      if (record.smallUrl) blobUrlSet.add(record.smallUrl);
      if (record.mediumUrl) blobUrlSet.add(record.mediumUrl);
      if (record.largeUrl) blobUrlSet.add(record.largeUrl);
    }
    const blobUrlsToDelete = Array.from(blobUrlSet);

    // IMPORTANT: Delete database records FIRST in a single atomic batch transaction
    // This ensures we don't leave orphaned DB records if blob deletion partially fails
    // If DB deletion fails, we abort before deleting any blobs (safe rollback)
    const recordIds = orphanedRecords.map(r => r.id);
    await db
      .delete(profilePhotos)
      .where(inArray(profilePhotos.id, recordIds));

    // Now delete blobs from Vercel Blob storage (if token is configured)
    // This is best-effort - if it fails, blobs become orphaned but DB is clean
    // Orphaned blobs can be cleaned up via Vercel dashboard or future reconciliation
    let blobsDeleted = 0;
    let blobDeletionFailed = false;
    if (process.env.BLOB_READ_WRITE_TOKEN && blobUrlsToDelete.length > 0) {
      try {
        await del(blobUrlsToDelete, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        blobsDeleted = blobUrlsToDelete.length;
      } catch (blobError) {
        blobDeletionFailed = true;
        // Log structured warning for ops monitoring
        console.warn('[cleanup-photos] Blob deletion failed:', {
          error: blobError instanceof Error ? blobError.message : blobError,
          blobCount: blobUrlsToDelete.length,
          recordsDeleted: recordIds.length,
        });
        await captureWarning('Blob deletion failed during photo cleanup', blobError, {
          blobCount: blobUrlsToDelete.length,
          recordsDeleted: recordIds.length,
        });
      }
    }

    console.log(
      `[cleanup-photos] Deleted ${recordIds.length} orphaned records, ${blobsDeleted} blobs`
    );

    return NextResponse.json(
      {
        success: true,
        message: `Cleaned up ${recordIds.length} orphaned photo records`,
        deleted: recordIds.length,
        blobsDeleted,
        blobDeletionFailed,
        details: {
          failed: orphanedRecords.filter(r => r.status === 'failed').length,
          stuckUploading: orphanedRecords.filter(r => r.status === 'uploading')
            .length,
          stuckProcessing: orphanedRecords.filter(
            r => r.status === 'processing'
          ).length,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('[cleanup-photos] Cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
