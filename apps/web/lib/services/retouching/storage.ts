import 'server-only';

import { put } from '@vercel/blob';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

/**
 * Retouch result storage — public Vercel Blob, mirroring the album-art
 * storage pattern. Chat source attachments already live on Vercel Blob, so
 * results reuse the same store. (An R2 migration for all per-user file
 * storage is tracked separately under the file-management epic; this module
 * is the single seam to swap when that lands.)
 */

function fallbackBlobUrl(path: string): string {
  return `https://blob.vercel-storage.com/${path}`;
}

function extensionForMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/webp') return 'webp';
  return 'jpg';
}

export interface RetouchResultUpload {
  /** Storage key persisted to retouch_jobs.result_asset_id. */
  readonly assetId: string;
  /** Public URL returned to chat. */
  readonly url: string;
}

export async function uploadRetouchResult(params: {
  readonly userId: string;
  readonly jobId: string;
  readonly image: Buffer;
  readonly mediaType: string;
}): Promise<RetouchResultUpload> {
  const path = `retouch/${params.userId}/${params.jobId}/result.${extensionForMediaType(params.mediaType)}`;

  if (!env.BLOB_READ_WRITE_TOKEN) {
    if (env.NODE_ENV === 'production') {
      throw new TypeError('Blob storage not configured');
    }
    logger.warn('[retouch] Blob token missing; returning development URL', {
      path,
    });
    return { assetId: path, url: fallbackBlobUrl(path) };
  }

  const blob = await put(path, params.image, {
    access: 'public',
    token: env.BLOB_READ_WRITE_TOKEN,
    contentType: params.mediaType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    addRandomSuffix: false,
  });

  if (!blob.url?.startsWith('https://')) {
    throw new TypeError('Invalid blob URL returned from storage');
  }

  return { assetId: path, url: blob.url };
}
