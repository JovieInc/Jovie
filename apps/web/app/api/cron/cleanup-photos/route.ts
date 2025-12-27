import { del } from '@vercel/blob';
import { and, eq, lt, or } from 'drizzle-orm';
import { db, profilePhotos } from '@/lib/db';
import { withCronAuthAndErrorHandler } from '@/lib/api/middleware';
import { successResponse } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FAILED_RECORD_MAX_AGE_HOURS = 24;
const UPLOADING_RECORD_MAX_AGE_HOURS = 1;

/**
 * Cron job to clean up orphaned profile_photos records:
 * - Failed uploads older than 24 hours
 * - Stuck "uploading" or "processing" records older than 1 hour
 *
 * Also attempts to delete associated blob storage files.
 *
 * Schedule: Daily at 3:00 AM UTC (configured in vercel.json)
 */
export const GET = withCronAuthAndErrorHandler(
  async () => {
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
      .where(
        or(
          and(
            eq(profilePhotos.status, 'failed'),
            lt(profilePhotos.createdAt, failedCutoff)
          ),
          and(
            eq(profilePhotos.status, 'uploading'),
            lt(profilePhotos.createdAt, stuckCutoff)
          ),
          and(
            eq(profilePhotos.status, 'processing'),
            lt(profilePhotos.createdAt, stuckCutoff)
          )
        )
      )
      .limit(100);

    if (orphanedRecords.length === 0) {
      return successResponse({
        message: 'No orphaned records found',
        deleted: 0,
        blobsDeleted: 0,
      });
    }

    const blobUrlsToDelete: string[] = [];
    for (const record of orphanedRecords) {
      if (record.blobUrl) blobUrlsToDelete.push(record.blobUrl);
      if (record.smallUrl) blobUrlsToDelete.push(record.smallUrl);
      if (record.mediumUrl) blobUrlsToDelete.push(record.mediumUrl);
      if (record.largeUrl) blobUrlsToDelete.push(record.largeUrl);
    }

    let blobsDeleted = 0;
    if (process.env.BLOB_READ_WRITE_TOKEN && blobUrlsToDelete.length > 0) {
      try {
        await del(blobUrlsToDelete, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        blobsDeleted = blobUrlsToDelete.length;
      } catch (blobError) {
        console.warn('[cleanup-photos] Failed to delete some blobs:', blobError);
      }
    }

    const recordIds = orphanedRecords.map(r => r.id);
    for (const id of recordIds) {
      await db.delete(profilePhotos).where(eq(profilePhotos.id, id));
    }

    console.log(
      `[cleanup-photos] Deleted ${recordIds.length} orphaned records, ${blobsDeleted} blobs`
    );

    return successResponse({
      message: `Cleaned up ${recordIds.length} orphaned photo records`,
      deleted: recordIds.length,
      blobsDeleted,
      details: {
        failed: orphanedRecords.filter(r => r.status === 'failed').length,
        stuckUploading: orphanedRecords.filter(r => r.status === 'uploading').length,
        stuckProcessing: orphanedRecords.filter(r => r.status === 'processing').length,
      },
    });
  },
  { route: '/api/cron/cleanup-photos' }
);
