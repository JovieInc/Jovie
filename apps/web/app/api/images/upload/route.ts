import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getOptionalAuth } from '@/lib/auth/cached';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateAvatarCache, invalidateProfileCache } from '@/lib/cache';
import { isPressPhotoSchemaUnavailableError } from '@/lib/db/queries/press-photos';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { buildSeoFilename } from '@/lib/images/config';
import { avatarUploadLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  AVIF_MIME_TYPE,
  buildBlobPath,
  errorResponse,
  extractPgError,
  getImageBufferMetadata,
  getVercelBlobUploader,
  NO_STORE_HEADERS,
  optimizeImageToAvif,
  PROCESSING_TIMEOUT_MS,
  processAvatarToSizes,
  processPressPhotoToSizes,
  UPLOAD_ERROR_CODES,
  uploadBufferToBlob,
  validateUploadedFile,
  withTimeout,
} from './lib';

// Re-export types for backwards compatibility
export type { UploadErrorCode } from './lib';

export const runtime = 'nodejs';

const MAX_PRESS_PHOTOS = 6;

type DbTx = typeof import('@/lib/db').db;

interface UploadContext {
  tx: DbTx;
  clerkUserId: string;
  dbUserId: string;
  profileId: string;
  usernameNormalized: string;
  settings: Record<string, unknown> | null;
  photoRecordId: string;
  seoFileName: string;
  put: Awaited<ReturnType<typeof getVercelBlobUploader>>;
  file: File;
}

async function uploadPressPhoto(ctx: UploadContext): Promise<NextResponse> {
  const pressSizeBuffers = await withTimeout(
    processPressPhotoToSizes(ctx.file),
    PROCESSING_TIMEOUT_MS,
    'Press photo size processing'
  );

  const originalBuffer = pressSizeBuffers.original;
  if (!originalBuffer) {
    throw new TypeError('Missing original press photo buffer');
  }

  // Upload original + all sized variants concurrently — each independent I/O
  // to Vercel Blob. Promise.all preserves first-failure-aborts semantics.
  const originalUploadPromise = withTimeout(
    uploadBufferToBlob(
      ctx.put,
      buildBlobPath(ctx.seoFileName, ctx.clerkUserId, 'press'),
      originalBuffer,
      AVIF_MIME_TYPE
    ),
    PROCESSING_TIMEOUT_MS,
    'Blob upload'
  );

  const sizeUploadsPromise = Promise.all(
    Object.entries(pressSizeBuffers)
      .filter(([sizeKey]) => sizeKey !== 'original')
      .map(async ([sizeKey, buffer]) => {
        const sizeUrl = await withTimeout(
          uploadBufferToBlob(
            ctx.put,
            buildBlobPath(
              `${ctx.seoFileName}-${sizeKey}`,
              ctx.clerkUserId,
              'press'
            ),
            buffer,
            AVIF_MIME_TYPE
          ),
          PROCESSING_TIMEOUT_MS,
          `Blob upload (${sizeKey})`
        );
        if (!sizeUrl?.startsWith('https://')) {
          throw new TypeError(`Invalid blob URL for size ${sizeKey}`);
        }
        return [sizeKey, sizeUrl] as const;
      })
  );

  const [blobUrl, sizeEntries] = await Promise.all([
    originalUploadPromise,
    sizeUploadsPromise,
  ]);

  if (!blobUrl?.startsWith('https://')) {
    throw new TypeError('Invalid blob URL returned from storage');
  }

  const pressPhotoSizes: Record<string, string> =
    Object.fromEntries(sizeEntries);

  const metadata = await withTimeout(
    getImageBufferMetadata(originalBuffer),
    PROCESSING_TIMEOUT_MS,
    'Press photo metadata'
  );

  await ctx.tx
    .update(profilePhotos)
    .set({
      blobUrl,
      smallUrl: pressPhotoSizes['400'] ?? blobUrl,
      mediumUrl: pressPhotoSizes['800'] ?? blobUrl,
      largeUrl: pressPhotoSizes['1200'] ?? blobUrl,
      status: 'ready',
      mimeType: AVIF_MIME_TYPE,
      fileSize: originalBuffer.length,
      width: metadata.width,
      height: metadata.height,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profilePhotos.id, ctx.photoRecordId));

  try {
    await invalidateProfileCache(ctx.usernameNormalized);
  } catch (error) {
    logger.error('[upload] Press photo cache invalidation failed', {
      photoId: ctx.photoRecordId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json(
    {
      jobId: ctx.photoRecordId,
      photoId: ctx.photoRecordId,
      photoType: 'press',
      status: 'ready',
      blobUrl,
      largeUrl: pressPhotoSizes['1200'] ?? blobUrl,
      mediumUrl: pressPhotoSizes['800'] ?? blobUrl,
      smallUrl: pressPhotoSizes['400'] ?? blobUrl,
    },
    { status: 202, headers: NO_STORE_HEADERS }
  );
}

async function uploadAvatarPhoto(ctx: UploadContext): Promise<NextResponse> {
  const optimized = await withTimeout(
    optimizeImageToAvif(ctx.file),
    PROCESSING_TIMEOUT_MS,
    'Image processing'
  );

  const avatarSizeBuffers = await withTimeout(
    processAvatarToSizes(ctx.file),
    PROCESSING_TIMEOUT_MS,
    'Avatar size processing'
  );

  // Upload primary avatar + all sized variants concurrently — each independent
  // I/O to Vercel Blob. Promise.all preserves first-failure-aborts semantics.
  const avatarUrlPromise = withTimeout(
    uploadBufferToBlob(
      ctx.put,
      buildBlobPath(ctx.seoFileName, ctx.clerkUserId, 'avatar'),
      optimized.avatar.data,
      AVIF_MIME_TYPE
    ),
    PROCESSING_TIMEOUT_MS,
    'Blob upload'
  );

  const avatarSizeEntriesPromise = Promise.all(
    Object.entries(avatarSizeBuffers).map(async ([sizeKey, buffer]) => {
      const sizeSuffix = sizeKey === 'original' ? '-original' : `-${sizeKey}`;
      const sizeUrl = await withTimeout(
        uploadBufferToBlob(
          ctx.put,
          buildBlobPath(
            `${ctx.seoFileName}${sizeSuffix}`,
            ctx.clerkUserId,
            'avatar'
          ),
          buffer,
          AVIF_MIME_TYPE
        ),
        PROCESSING_TIMEOUT_MS,
        `Blob upload (${sizeKey})`
      );
      if (!sizeUrl?.startsWith('https://')) {
        throw new TypeError(`Invalid blob URL for size ${sizeKey}`);
      }
      return [sizeKey, sizeUrl] as const;
    })
  );

  const [avatarUrl, avatarSizeEntries] = await Promise.all([
    avatarUrlPromise,
    avatarSizeEntriesPromise,
  ]);

  if (!avatarUrl?.startsWith('https://')) {
    throw new TypeError('Invalid blob URL returned from storage');
  }

  const avatarSizes: Record<string, string> =
    Object.fromEntries(avatarSizeEntries);

  await ctx.tx
    .update(profilePhotos)
    .set({
      blobUrl: avatarUrl,
      smallUrl: avatarSizes['128'] ?? avatarUrl,
      mediumUrl: avatarSizes['512'] ?? avatarSizes['256'] ?? avatarUrl,
      largeUrl: avatarSizes['1024'] ?? avatarSizes['512'] ?? avatarUrl,
      status: 'ready',
      mimeType: AVIF_MIME_TYPE,
      fileSize: optimized.avatar.info.size ?? optimized.avatar.data.length,
      width: optimized.width ?? null,
      height: optimized.height ?? null,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profilePhotos.id, ctx.photoRecordId));

  const currentSettings = ctx.settings ?? {};
  await ctx.tx
    .update(creatorProfiles)
    .set({
      settings: {
        ...currentSettings,
        avatarSizes,
      },
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, ctx.profileId));

  await invalidateAvatarCache(ctx.dbUserId, ctx.usernameNormalized);

  return NextResponse.json(
    {
      jobId: ctx.photoRecordId,
      photoId: ctx.photoRecordId,
      photoType: 'avatar',
      status: 'ready',
      avatarUrl,
      blobUrl: avatarUrl,
      largeUrl: avatarSizes['1024'] ?? avatarSizes['512'] ?? avatarUrl,
      mediumUrl: avatarSizes['512'] ?? avatarSizes['256'] ?? avatarUrl,
      smallUrl: avatarSizes['128'] ?? avatarUrl,
      avatarSizes,
    },
    { status: 202, headers: NO_STORE_HEADERS }
  );
}

async function handleUploadError(error: unknown): Promise<NextResponse> {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message.includes('aborted') ||
      error.message.includes('abort'))
  ) {
    return errorResponse(
      'Upload was cancelled.',
      UPLOAD_ERROR_CODES.UPLOAD_FAILED,
      499
    );
  }

  if (isPressPhotoSchemaUnavailableError(error)) {
    return errorResponse(
      'Press photos are temporarily unavailable while setup finishes. Please try again in a minute.',
      UPLOAD_ERROR_CODES.UPLOAD_FAILED,
      503,
      { retryable: true }
    );
  }

  logger.error('Image upload error:', error);
  await captureError('Image upload failed', error, {
    route: '/api/images/upload',
    method: 'POST',
  });

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

export async function POST(request: NextRequest) {
  // Auth check first to avoid wrapping in transaction when unauthorized
  const { userId: clerkUserId } = await getOptionalAuth();
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
    logger.error('BLOB_READ_WRITE_TOKEN is not configured');
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
      const rateLimitResult =
        await avatarUploadLimiter.limit(userIdFromSession);
      if (!rateLimitResult.success) {
        const retryAfter = Math.round(
          (rateLimitResult.reset.getTime() - Date.now()) / 1000
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
              'X-RateLimit-Reset': rateLimitResult.reset.toISOString(),
            },
          }
        );
      }

      // Validate the uploaded file
      const validationResult = await validateUploadedFile(request);
      if (validationResult instanceof NextResponse) {
        return validationResult;
      }

      const { file, normalizedType, photoType } = validationResult;

      // Look up the internal user ID (UUID) for the authenticated Clerk user
      const dbUser = await getUserByClerkId(tx, userIdFromSession);

      if (!dbUser) {
        return errorResponse(
          'User account not found. Please sign in again.',
          UPLOAD_ERROR_CODES.USER_NOT_FOUND,
          404
        );
      }

      const [activeUser] = await tx
        .select({ activeProfileId: users.activeProfileId })
        .from(users)
        .where(eq(users.id, dbUser.id))
        .limit(1);

      const [profile] = await tx
        .select({
          id: creatorProfiles.id,
          usernameNormalized: creatorProfiles.usernameNormalized,
          settings: creatorProfiles.settings,
        })
        .from(creatorProfiles)
        .where(
          activeUser?.activeProfileId
            ? and(
                eq(creatorProfiles.id, activeUser.activeProfileId),
                eq(creatorProfiles.userId, dbUser.id)
              )
            : eq(creatorProfiles.userId, dbUser.id)
        )
        .limit(1);

      if (!profile) {
        return errorResponse(
          'Profile not found for this account.',
          UPLOAD_ERROR_CODES.USER_NOT_FOUND,
          404
        );
      }

      if (photoType === 'press') {
        const existingPressPhotos = await tx
          .select({ id: profilePhotos.id })
          .from(profilePhotos)
          .where(
            and(
              eq(profilePhotos.userId, dbUser.id),
              eq(profilePhotos.creatorProfileId, profile.id),
              eq(profilePhotos.photoType, 'press'),
              inArray(profilePhotos.status, [
                'uploading',
                'processing',
                'ready',
              ])
            )
          )
          .limit(MAX_PRESS_PHOTOS);

        if (existingPressPhotos.length >= MAX_PRESS_PHOTOS) {
          return errorResponse(
            `You can upload up to ${MAX_PRESS_PHOTOS} press photos.`,
            UPLOAD_ERROR_CODES.PRESS_PHOTO_LIMIT_REACHED,
            400
          );
        }
      }

      // Create database record first
      const [photoRecord] = await tx
        .insert(profilePhotos)
        .values({
          userId: dbUser.id,
          creatorProfileId: profile.id,
          status: 'uploading',
          photoType,
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

        const seoFileName = buildSeoFilename({
          originalFilename: file.name,
          photoId: photoRecord.id,
        });
        const put = await getVercelBlobUploader();

        const ctx: UploadContext = {
          tx,
          clerkUserId,
          dbUserId: dbUser.id,
          profileId: profile.id,
          usernameNormalized: profile.usernameNormalized,
          settings: profile.settings as Record<string, unknown> | null,
          photoRecordId: photoRecord.id,
          seoFileName,
          put,
          file,
        };

        if (photoType === 'press') {
          return await uploadPressPhoto(ctx);
        }

        return await uploadAvatarPhoto(ctx);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload failed';
        const pgError = extractPgError(error);

        logger.error('[upload] Finalize failed', {
          photoId: photoRecord.id,
          message,
          stack: error instanceof Error ? error.stack : undefined,
          pgError,
        });

        throw error;
      }
    });
  } catch (error) {
    return handleUploadError(error);
  }
}
