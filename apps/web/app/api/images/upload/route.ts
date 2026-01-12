import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import type { OutputInfo } from 'sharp';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateAvatarCache } from '@/lib/cache';
import { creatorProfiles, eq, profilePhotos, users } from '@/lib/db';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  AVATAR_OPTIMIZED_SIZES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { avatarUploadRateLimit } from '@/lib/rate-limit';
import { imageUploadSchema } from '@/lib/validation/schemas';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const UPLOAD_ERROR_CODES = {
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
  const headers = new Headers(options?.headers);
  headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
  return NextResponse.json(body, { status, headers });
}

type BlobPut = typeof import('@vercel/blob').put;
type SharpModule = typeof import('sharp');
type SharpConstructor = SharpModule extends { default: infer D }
  ? D
  : SharpModule;
const AVIF_MIME_TYPE = 'image/avif';
const AVATAR_CANONICAL_SIZE = AVATAR_OPTIMIZED_SIZES[2]; // 512px canonical

type PgErrorInfo = {
  code?: string;
  detail?: string;
  hint?: string;
  schema?: string;
  table?: string;
  constraint?: string;
};

const extractPgError = (error: unknown): PgErrorInfo | null => {
  if (typeof error !== 'object' || error === null) return null;
  const maybeError = error as Record<string, unknown>;
  return {
    code: typeof maybeError.code === 'string' ? maybeError.code : undefined,
    detail:
      typeof maybeError.detail === 'string' ? maybeError.detail : undefined,
    hint: typeof maybeError.hint === 'string' ? maybeError.hint : undefined,
    schema:
      typeof maybeError.schema === 'string' ? maybeError.schema : undefined,
    table: typeof maybeError.table === 'string' ? maybeError.table : undefined,
    constraint:
      typeof maybeError.constraint === 'string'
        ? maybeError.constraint
        : undefined,
  };
};

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

async function fileToBuffer(file: File): Promise<Buffer> {
  const arrayBuffer =
    typeof file.arrayBuffer === 'function'
      ? await file.arrayBuffer()
      : await new Response(file).arrayBuffer();

  return Buffer.from(arrayBuffer);
}

const MAX_BLOB_UPLOAD_RETRIES = 2;
const BLOB_RETRY_DELAY_MS = 500;

function buildBlobPath(seoFileName: string, clerkUserId: string) {
  return `avatars/users/${clerkUserId}/${seoFileName}.avif`;
}

async function uploadBufferToBlob(
  put: BlobPut | null,
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

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

      console.warn(
        `Blob upload attempt ${attempt + 1} failed, retrying in ${BLOB_RETRY_DELAY_MS}ms:`,
        lastError.message
      );
      await new Promise(resolve => setTimeout(resolve, BLOB_RETRY_DELAY_MS));
    }
  }

  throw lastError ?? new Error('Blob upload failed after retries');
}

async function optimizeImageToAvif(file: File): Promise<{
  avatar: { data: Buffer; info: OutputInfo };
  width: number | null;
  height: number | null;
}> {
  const sharp = await getSharp();
  const inputBuffer = await fileToBuffer(file);

  const baseImage = sharp(inputBuffer, {
    failOnError: false,
  })
    .rotate()
    .withMetadata({ orientation: undefined });

  const metadata = await baseImage.metadata();

  const avatar = await baseImage
    .clone()
    .resize({
      width: AVATAR_CANONICAL_SIZE,
      height: AVATAR_CANONICAL_SIZE,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .avif({ quality: 65, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    avatar,
    width: avatar.info.width ?? metadata.width ?? null,
    height: avatar.info.height ?? metadata.height ?? null,
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
  // Auth check first to avoid wrapping in transaction when unauthorized
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return errorResponse(
      'Please sign in to upload a profile photo.',
      UPLOAD_ERROR_CODES.UNAUTHORIZED,
      401
    );
  }

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
    // Some test environments may mock withDbSessionTx away; provide fallback
    const runWithSession =
      typeof withDbSessionTx === 'function'
        ? withDbSessionTx
        : async <T>(
            operation: (
              tx: typeof import('@/lib/db').db,
              userId: string
            ) => Promise<T>
          ) => {
            return operation(
              (await import('@/lib/db')).db,
              clerkUserId
            ) as unknown as Promise<T>;
          };

    return await runWithSession(async (tx, userIdFromSession) => {
      // Rate limiting - 3 uploads per minute per user
      if (avatarUploadRateLimit) {
        const rateLimitResult =
          await avatarUploadRateLimit.limit(userIdFromSession);
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
          userIdFromSession.slice(0, 10) + '...'
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
      const validation = imageUploadSchema.safeParse({
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
      const [dbUser] = await tx
        .select({
          id: users.id,
          clerkId: users.clerkId,
        })
        .from(users)
        .where(eq(users.clerkId, userIdFromSession))
        .limit(1);

      if (!dbUser) {
        return errorResponse(
          'User account not found. Please sign in again.',
          UPLOAD_ERROR_CODES.USER_NOT_FOUND,
          404
        );
      }

      // Create database record first
      const [photoRecord] = await tx
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
        await tx
          .update(profilePhotos)
          .set({
            status: 'processing',
            updatedAt: new Date(),
          })
          .where(eq(profilePhotos.id, photoRecord.id));

        // Process image with timeout protection (single canonical AVIF)
        const optimized = await withTimeout(
          optimizeImageToAvif(file),
          PROCESSING_TIMEOUT_MS,
          'Image processing'
        );

        const seoFileName = buildSeoFilename({
          originalFilename: file.name,
          photoId: photoRecord.id,
        });
        const blobPath = buildBlobPath(seoFileName, clerkUserId);
        const put = await getVercelBlobUploader();

        const avatarUrl = await withTimeout(
          uploadBufferToBlob(
            put,
            blobPath,
            optimized.avatar.data,
            AVIF_MIME_TYPE
          ),
          PROCESSING_TIMEOUT_MS,
          'Blob upload'
        );

        // Validate that we got real URLs back
        if (!avatarUrl || !avatarUrl.startsWith('https://')) {
          throw new Error('Invalid blob URL returned from storage');
        }

        // Update record with optimized URLs
        await tx
          .update(profilePhotos)
          .set({
            blobUrl: avatarUrl,
            smallUrl: avatarUrl,
            mediumUrl: avatarUrl,
            largeUrl: avatarUrl,
            // Use legacy-friendly status that exists in both old/new enums
            status: 'ready',
            mimeType: AVIF_MIME_TYPE,
            fileSize:
              optimized.avatar.info.size ?? optimized.avatar.data.length,
            width: optimized.width ?? null,
            height: optimized.height ?? null,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(profilePhotos.id, photoRecord.id));

        // Get the user's profile username for cache invalidation
        const [profile] = await tx
          .select({ usernameNormalized: creatorProfiles.usernameNormalized })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, dbUser.id))
          .limit(1);

        // Invalidate avatar caches so profile shows updated image
        await invalidateAvatarCache(
          dbUser.id,
          profile?.usernameNormalized ?? null
        );

        return NextResponse.json(
          {
            jobId: photoRecord.id,
            photoId: photoRecord.id,
            status: 'ready',
            avatarUrl,
            blobUrl: avatarUrl,
            largeUrl: avatarUrl,
            mediumUrl: avatarUrl,
            smallUrl: avatarUrl,
          },
          { status: 202, headers: NO_STORE_HEADERS }
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload failed';
        const pgError = extractPgError(error);

        console.error('[upload] Finalize failed', {
          photoId: photoRecord.id,
          message,
          stack: error instanceof Error ? error.stack : undefined,
          pgError,
        });

        // Propagate so outer catch handles generic error response
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
