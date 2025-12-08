import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import type { OutputInfo } from 'sharp';
import { z } from 'zod';
import { withDbSession } from '@/lib/auth/session';
import { db, profilePhotos, users } from '@/lib/db';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  AVATAR_OPTIMIZED_SIZES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { avatarUploadRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs'; // Required for file upload processing

// Structured error codes for client handling
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

interface UploadErrorResponse {
  error: string;
  code: UploadErrorCode;
  retryable?: boolean;
  retryAfter?: number;
}

function errorResponse(
  error: string,
  code: UploadErrorCode,
  status: number,
  options?: { retryable?: boolean; retryAfter?: number; headers?: HeadersInit }
) {
  const body: UploadErrorResponse = { error, code };
  if (options?.retryable !== undefined) body.retryable = options.retryable;
  if (options?.retryAfter !== undefined) body.retryAfter = options.retryAfter;
  return NextResponse.json(body, { status, headers: options?.headers });
}

type BlobPut = typeof import('@vercel/blob').put;
type SharpModule = typeof import('sharp');
type SharpConstructor = SharpModule extends { default: infer D }
  ? D
  : SharpModule;
const WEBP_MIME_TYPE = 'image/webp';

// Dynamically import Vercel Blob when needed
async function getVercelBlobUploader(): Promise<BlobPut | null> {
  try {
    const blobModule = await import('@vercel/blob');
    return blobModule.put;
  } catch {
    console.warn('@vercel/blob not available, using mock implementation');
    return null;
  }
}

async function getSharp(): Promise<SharpConstructor> {
  const sharpModule = (await import('sharp')) as unknown as SharpModule;
  const factory = (sharpModule as SharpModule & { default?: unknown }).default;
  if (factory) {
    return factory as SharpConstructor;
  }
  return sharpModule as unknown as SharpConstructor;
}

const uploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.enum(SUPPORTED_IMAGE_MIME_TYPES),
});

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();

  return Buffer.from(arrayBuffer);
}

function buildBlobPaths(seoFileName: string, clerkUserId: string) {
  const basePath = `avatars/users/${clerkUserId}/${seoFileName}`;

  return {
    original: `${basePath}.webp`,
    large: `${basePath}-lg.webp`,
    medium: `${basePath}-md.webp`,
    small: `${basePath}-sm.webp`,
  };
}

const MAX_BLOB_UPLOAD_RETRIES = 2;
const BLOB_RETRY_DELAY_MS = 500;

async function uploadBufferToBlob(
  put: BlobPut | null,
  path: string,
  buffer: Buffer
): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // Development/test fallback when token is missing
  if (!put || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Blob storage not configured');
    }
    console.warn(
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
        contentType: WEBP_MIME_TYPE,
        cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 year
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

      console.warn(
        `Blob upload attempt ${attempt + 1} failed, retrying in ${BLOB_RETRY_DELAY_MS}ms:`,
        lastError.message
      );
      await new Promise(resolve => setTimeout(resolve, BLOB_RETRY_DELAY_MS));
    }
  }

  throw lastError ?? new Error('Blob upload failed after retries');
}

async function optimizeImageToWebp(file: File): Promise<{
  original: { data: Buffer; info: OutputInfo };
  large: Buffer;
  medium: Buffer;
  small: Buffer;
  width: number | null;
  height: number | null;
}> {
  const sharp = await getSharp();
  const inputBuffer = await fileToBuffer(file);

  const baseImage = sharp(inputBuffer, {
    failOnError: false,
  }).rotate();

  const metadata = await baseImage.metadata();

  const original = await baseImage
    .clone()
    .resize({
      width: AVATAR_OPTIMIZED_SIZES.original,
      height: AVATAR_OPTIMIZED_SIZES.original,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 5, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

  const createVariant = (size: number) =>
    baseImage
      .clone()
      .resize({
        width: size,
        height: size,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 5, smartSubsample: true })
      .toBuffer();

  const [large, medium, small] = await Promise.all([
    createVariant(AVATAR_OPTIMIZED_SIZES.large),
    createVariant(AVATAR_OPTIMIZED_SIZES.medium),
    createVariant(AVATAR_OPTIMIZED_SIZES.small),
  ]);

  return {
    original,
    large,
    medium,
    small,
    width: original.info.width ?? metadata.width ?? null,
    height: original.info.height ?? metadata.height ?? null,
  };
}

// Timeout wrapper for image processing
const PROCESSING_TIMEOUT_MS = 30_000; // 30 seconds

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  // Early check for blob token in production
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.BLOB_READ_WRITE_TOKEN
  ) {
    console.error('BLOB_READ_WRITE_TOKEN is not configured');
    return errorResponse(
      'Image upload is temporarily unavailable. Please try again later.',
      UPLOAD_ERROR_CODES.MISSING_BLOB_TOKEN,
      503,
      { retryable: true }
    );
  }

  try {
    return await withDbSession(async clerkUserId => {
      // Rate limiting - 3 uploads per minute per user
      if (avatarUploadRateLimit) {
        const rateLimitResult = await avatarUploadRateLimit.limit(clerkUserId);
        if (!rateLimitResult.success) {
          const retryAfter = Math.round(
            (rateLimitResult.reset - Date.now()) / 1000
          );
          return errorResponse(
            'Too many upload attempts. Please wait before trying again.',
            UPLOAD_ERROR_CODES.RATE_LIMITED,
            429,
            {
              retryable: true,
              retryAfter,
              headers: {
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                'X-RateLimit-Reset': new Date(
                  rateLimitResult.reset
                ).toISOString(),
              },
            }
          );
        }
      } else if (process.env.NODE_ENV === 'production') {
        // Log warning in production when rate limiting is disabled
        console.warn(
          '[upload] Rate limiting disabled - Redis not configured. User:',
          clerkUserId.slice(0, 10) + '...'
        );
      }

      // Validate content type and size
      const contentType = request.headers.get('content-type');
      if (!contentType?.startsWith('multipart/form-data')) {
        return errorResponse(
          'Invalid content type. Expected multipart/form-data.',
          UPLOAD_ERROR_CODES.INVALID_CONTENT_TYPE,
          400
        );
      }

      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const normalizedType = (file?.type.toLowerCase?.() ?? '') as
        | SupportedImageMimeType
        | '';

      if (!file) {
        return errorResponse(
          'No file provided. Please select an image to upload.',
          UPLOAD_ERROR_CODES.NO_FILE,
          400
        );
      }

      // Validate file
      const validation = uploadSchema.safeParse({
        filename: file.name,
        contentType: normalizedType,
      });

      if (!validation.success) {
        const supportedTypes = SUPPORTED_IMAGE_MIME_TYPES.map(t =>
          t.replace('image/', '').toUpperCase()
        ).join(', ');
        return errorResponse(
          `Invalid file type. Supported formats: ${supportedTypes}`,
          UPLOAD_ERROR_CODES.INVALID_FILE,
          400
        );
      }

      // Validate magic bytes to prevent MIME type spoofing
      const fileBuffer = await fileToBuffer(file);
      if (!validateMagicBytes(fileBuffer, normalizedType)) {
        console.warn(
          `[upload] Magic bytes mismatch for claimed type ${normalizedType}`
        );
        return errorResponse(
          'File content does not match declared type. Please upload a valid image.',
          UPLOAD_ERROR_CODES.INVALID_FILE,
          400
        );
      }

      // Check file size (4MB limit)
      if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
        const maxMB = Math.round(AVATAR_MAX_FILE_SIZE_BYTES / (1024 * 1024));
        return errorResponse(
          `File too large. Maximum ${maxMB}MB allowed.`,
          UPLOAD_ERROR_CODES.FILE_TOO_LARGE,
          400
        );
      }

      // Look up the internal user ID (UUID) for the authenticated Clerk user
      const [dbUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!dbUser) {
        return errorResponse(
          'User account not found. Please sign in again.',
          UPLOAD_ERROR_CODES.USER_NOT_FOUND,
          404
        );
      }

      // Create database record first
      const [photoRecord] = await db
        .insert(profilePhotos)
        .values({
          userId: dbUser.id,
          status: 'uploading',
          originalFilename: file.name,
          mimeType: normalizedType,
          fileSize: file.size,
        })
        .returning();

      try {
        await db
          .update(profilePhotos)
          .set({
            status: 'processing',
            updatedAt: new Date(),
          })
          .where(eq(profilePhotos.id, photoRecord.id));

        // Process image with timeout protection
        const optimized = await withTimeout(
          optimizeImageToWebp(file),
          PROCESSING_TIMEOUT_MS,
          'Image processing'
        );
        const seoFileName = buildSeoFilename({
          originalFilename: file.name,
          photoId: photoRecord.id,
        });
        const blobPaths = buildBlobPaths(seoFileName, clerkUserId);
        const put = await getVercelBlobUploader();

        // Upload all variants with timeout protection
        const [blobUrl, largeUrl, mediumUrl, smallUrl] = await withTimeout(
          Promise.all([
            uploadBufferToBlob(
              put,
              blobPaths.original,
              optimized.original.data
            ),
            uploadBufferToBlob(put, blobPaths.large, optimized.large),
            uploadBufferToBlob(put, blobPaths.medium, optimized.medium),
            uploadBufferToBlob(put, blobPaths.small, optimized.small),
          ]),
          PROCESSING_TIMEOUT_MS,
          'Blob upload'
        );

        // Validate that we got real URLs back
        if (!blobUrl || !blobUrl.startsWith('https://')) {
          throw new Error('Invalid blob URL returned from storage');
        }

        // Update record with optimized URLs
        await db
          .update(profilePhotos)
          .set({
            blobUrl,
            smallUrl,
            mediumUrl,
            largeUrl,
            status: 'completed',
            mimeType: WEBP_MIME_TYPE,
            fileSize:
              optimized.original.info.size ?? optimized.original.data.length,
            width: optimized.width ?? null,
            height: optimized.height ?? null,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(profilePhotos.id, photoRecord.id));

        return NextResponse.json(
          {
            id: photoRecord.id,
            status: 'completed',
            blobUrl,
            smallUrl,
            mediumUrl,
            largeUrl,
          },
          { status: 201 }
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload failed';

        // Update record with error status
        await db
          .update(profilePhotos)
          .set({
            status: 'failed',
            errorMessage: message,
            updatedAt: new Date(),
          })
          .where(eq(profilePhotos.id, photoRecord.id));

        const lowerMessage = message.toLowerCase();

        // Categorize errors for appropriate client response
        if (lowerMessage.includes('timed out')) {
          return errorResponse(
            'Image processing took too long. Please try a smaller image.',
            UPLOAD_ERROR_CODES.PROCESSING_TIMEOUT,
            408,
            { retryable: true }
          );
        }

        if (
          lowerMessage.includes('unsupported image format') ||
          lowerMessage.includes('input buffer') ||
          lowerMessage.includes('invalid')
        ) {
          return errorResponse(
            'Invalid image file. Please upload a supported image format.',
            UPLOAD_ERROR_CODES.INVALID_IMAGE,
            400
          );
        }

        if (lowerMessage.includes('blob') || lowerMessage.includes('storage')) {
          return errorResponse(
            'Failed to save image. Please try again.',
            UPLOAD_ERROR_CODES.BLOB_UPLOAD_FAILED,
            502,
            { retryable: true }
          );
        }

        throw error;
      }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse(
        'Please sign in to upload a profile photo.',
        UPLOAD_ERROR_CODES.UNAUTHORIZED,
        401
      );
    }

    return errorResponse(
      'Upload failed. Please try again.',
      UPLOAD_ERROR_CODES.UPLOAD_FAILED,
      500,
      { retryable: true }
    );
  }
}
