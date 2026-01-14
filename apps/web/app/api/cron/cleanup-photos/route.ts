import { del } from '@vercel/blob';
import { and, eq, lt, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, profilePhotos } from '@/lib/db';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for cleanup

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// Vercel Cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

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
  // Verify cron secret in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
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

    // Collect blob URLs to delete
    const blobUrlsToDelete: string[] = [];
    for (const record of orphanedRecords) {
      if (record.blobUrl) blobUrlsToDelete.push(record.blobUrl);
      if (record.smallUrl) blobUrlsToDelete.push(record.smallUrl);
      if (record.mediumUrl) blobUrlsToDelete.push(record.mediumUrl);
      if (record.largeUrl) blobUrlsToDelete.push(record.largeUrl);
    }

    // Delete blobs from Vercel Blob storage (if token is configured)
    let blobsDeleted = 0;
    if (process.env.BLOB_READ_WRITE_TOKEN && blobUrlsToDelete.length > 0) {
      try {
        await del(blobUrlsToDelete, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        blobsDeleted = blobUrlsToDelete.length;
      } catch (blobError) {
        // Log but don't fail - blob deletion is best-effort
        logger.warn('Failed to delete some blobs:', blobError);
      }
    }

    // Delete database records
    const recordIds = orphanedRecords.map(r => r.id);
    for (const id of recordIds) {
      await db.delete(profilePhotos).where(eq(profilePhotos.id, id));
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
