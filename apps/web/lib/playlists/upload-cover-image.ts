import 'server-only';
import {
  getBlobCommandOptions,
  isBlobStorageConfigured,
} from '@/lib/blob-config';
import { captureError } from '@/lib/error-tracking';
import { executeWithRetry, withTimeout } from '@/lib/resilience/primitives';

const PLAYLIST_COVER_UPLOAD_TIMEOUT_MS = 20_000;
const PLAYLIST_COVER_UPLOAD_RETRIES = 2;

function isRetryableBlobUploadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('503') ||
    message.includes('429')
  );
}

export async function uploadPlaylistCoverImage(options: {
  slug: string;
  imageBuffer: Buffer;
}): Promise<string | null> {
  const { slug, imageBuffer } = options;

  try {
    const blobModule = await import('@vercel/blob');

    if (!isBlobStorageConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Blob storage is not configured');
      }
      return `https://blob.vercel-storage.com/playlists/${slug}/cover.jpg`;
    }

    const objectPath = `playlists/${slug}/cover-${Date.now()}.jpg`;

    const blob = await executeWithRetry(
      () =>
        withTimeout(
          blobModule.put(objectPath, imageBuffer, {
            access: 'public',
            ...getBlobCommandOptions(),
            contentType: 'image/jpeg',
            cacheControlMaxAge: 60 * 60 * 24 * 365,
            addRandomSuffix: false,
          }),
          {
            timeoutMs: PLAYLIST_COVER_UPLOAD_TIMEOUT_MS,
            context: 'Playlist cover upload',
          }
        ),
      {
        maxRetries: PLAYLIST_COVER_UPLOAD_RETRIES,
        baseDelayMs: 250,
        maxDelayMs: 2_000,
        jitterRatio: 0.2,
        isRetryable: isRetryableBlobUploadError,
      }
    );

    if (!blob.url?.startsWith('https://')) {
      throw new Error('Invalid blob URL returned from storage');
    }

    return blob.url;
  } catch (error) {
    captureError('[Playlist Cover] Upload failed', error, { slug });
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    return null;
  }
}
