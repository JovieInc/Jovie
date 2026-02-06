/**
 * Cleanup Photos Cron Job Helpers
 *
 * Pure helper functions for the photo cleanup cron job.
 */

import { del } from '@vercel/blob';
import { and, eq, lt, or, type SQL } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { profilePhotos } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Shape of an orphaned record for cleanup operations.
 */
export interface OrphanedPhotoRecord {
  id: string;
  status: string | null;
  blobUrl: string | null;
  smallUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
}

/**
 * Verify cron job authorization in production.
 */
export function verifyCronAuth(
  request: Request,
  cronSecret: string | undefined
): NextResponse | null {
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  return null;
}

/**
 * Build the where clause for finding orphaned photo records.
 */
export function buildOrphanedRecordsWhereClause(
  failedCutoff: Date,
  stuckCutoff: Date
): SQL<unknown> {
  return or(
    // Failed records older than threshold
    and(
      eq(profilePhotos.status, 'failed'),
      lt(profilePhotos.createdAt, failedCutoff)
    ),
    // Stuck uploading records older than threshold
    and(
      eq(profilePhotos.status, 'uploading'),
      lt(profilePhotos.createdAt, stuckCutoff)
    ),
    // Stuck processing records older than threshold
    and(
      eq(profilePhotos.status, 'processing'),
      lt(profilePhotos.createdAt, stuckCutoff)
    )
  )!;
}

/**
 * Collect all blob URLs from orphaned records for deletion.
 */
export function collectBlobUrls(records: OrphanedPhotoRecord[]): string[] {
  const urls: string[] = [];

  for (const record of records) {
    if (record.blobUrl) urls.push(record.blobUrl);
    if (record.smallUrl) urls.push(record.smallUrl);
    if (record.mediumUrl) urls.push(record.mediumUrl);
    if (record.largeUrl) urls.push(record.largeUrl);
  }

  return urls;
}

/**
 * Delete blobs from Vercel Blob storage (best-effort).
 */
export async function deleteBlobsIfConfigured(urls: string[]): Promise<number> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token || urls.length === 0) {
    return 0;
  }

  try {
    await del(urls, { token });
    return urls.length;
  } catch (blobError) {
    logger.warn('Failed to delete some blobs:', blobError);
    return 0;
  }
}

/**
 * Build cleanup summary details from orphaned records.
 */
export function buildCleanupDetails(records: OrphanedPhotoRecord[]): {
  failed: number;
  stuckUploading: number;
  stuckProcessing: number;
} {
  return {
    failed: records.filter(r => r.status === 'failed').length,
    stuckUploading: records.filter(r => r.status === 'uploading').length,
    stuckProcessing: records.filter(r => r.status === 'processing').length,
  };
}
