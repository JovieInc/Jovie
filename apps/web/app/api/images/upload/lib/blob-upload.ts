/**
 * Blob Upload Utilities
 *
 * Handles uploading images to Vercel Blob storage.
 */

import { logger } from '@/lib/utils/logger';
import { BLOB_RETRY_DELAY_MS, MAX_BLOB_UPLOAD_RETRIES } from './constants';
import type { BlobPut } from './types';

export async function getVercelBlobUploader(): Promise<BlobPut | null> {
  try {
    const blobModule = await import('@vercel/blob');
    return blobModule.put;
  } catch {
    logger.warn('@vercel/blob not available, using mock implementation');
    return null;
  }
}

export function buildBlobPath(seoFileName: string, clerkUserId: string) {
  return `avatars/users/${clerkUserId}/${seoFileName}.avif`;
}

export async function uploadBufferToBlob(
  put: BlobPut | null,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!put || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new TypeError('Blob storage not configured');
    }
    logger.warn(
      '[DEV] BLOB_READ_WRITE_TOKEN missing, returning mock URL for:',
      path
    );
    return `https://blob.vercel-storage.com/${path}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_BLOB_UPLOAD_RETRIES; attempt++) {
    try {
      const blob = await put(path, buffer, {
        access: 'public',
        token,
        contentType,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        addRandomSuffix: false,
      });
      return blob.url;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isRetryable =
        lastError.message.includes('network') ||
        lastError.message.includes('timeout') ||
        lastError.message.includes('ECONNRESET') ||
        lastError.message.includes('503');

      if (!isRetryable || attempt === MAX_BLOB_UPLOAD_RETRIES) {
        throw lastError;
      }

      logger.warn(
        `Blob upload attempt ${attempt + 1} failed, retrying in ${BLOB_RETRY_DELAY_MS}ms:`,
        lastError.message
      );
      await new Promise(resolve => setTimeout(resolve, BLOB_RETRY_DELAY_MS));
    }
  }

  throw lastError ?? new Error('Blob upload failed after retries');
}
