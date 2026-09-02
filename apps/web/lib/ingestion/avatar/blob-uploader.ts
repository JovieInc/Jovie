/**
 * Blob Uploader
 *
 * Utilities for uploading images to Vercel Blob storage.
 */

import { put } from '@vercel/blob';
import {
  getBlobCommandOptions,
  isBlobStorageConfigured,
} from '@/lib/blob-config';

/**
 * Upload a buffer to Vercel Blob storage.
 */
export async function uploadBufferToBlob(params: {
  path: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  if (!isBlobStorageConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new TypeError('Blob storage not configured');
    }
    return `https://blob.vercel-storage.com/${params.path}`;
  }

  const blob = await put(params.path, params.buffer, {
    access: 'public',
    ...getBlobCommandOptions(),
    contentType: params.contentType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    addRandomSuffix: false,
  });

  return blob.url;
}
