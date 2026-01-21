/**
 * Image Upload Constants
 *
 * Shared constants for the image upload API route.
 */

import { AVATAR_OPTIMIZED_SIZES } from '@/lib/images/config';

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const UPLOAD_ERROR_CODES = {
  MISSING_BLOB_TOKEN: 'MISSING_BLOB_TOKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CONTENT_TYPE: 'INVALID_CONTENT_TYPE',
  NO_FILE: 'NO_FILE',
  INVALID_FILE: 'INVALID_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_IMAGE: 'INVALID_IMAGE',
  BLOB_UPLOAD_FAILED: 'BLOB_UPLOAD_FAILED',
  PROCESSING_TIMEOUT: 'PROCESSING_TIMEOUT',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

export type UploadErrorCode =
  (typeof UPLOAD_ERROR_CODES)[keyof typeof UPLOAD_ERROR_CODES];

export const AVIF_MIME_TYPE = 'image/avif';
export const AVATAR_CANONICAL_SIZE = AVATAR_OPTIMIZED_SIZES[2]; // 512px canonical
export const MAX_BLOB_UPLOAD_RETRIES = 2;
export const BLOB_RETRY_DELAY_MS = 500;
export const PROCESSING_TIMEOUT_MS = 30_000; // 30 seconds
