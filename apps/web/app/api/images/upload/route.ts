import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { invalidateAvatarCache } from '@/lib/cache';
import { getUserByClerkId } from '@/lib/db/queries/shared';
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
  getVercelBlobUploader,
  NO_STORE_HEADERS,
  optimizeImageToAvif,
  processAvatarToSizes,
  PROCESSING_TIMEOUT_MS,
  UPLOAD_ERROR_CODES,
  uploadBufferToBlob,
  validateUploadedFile,
  withTimeout,
} from './lib';

// Re-export types for backwards compatibility
export type { UploadErrorCode } from './lib';

export const runtime = 'nodejs';

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

      const { file, normalizedType } = validationResult;

      // Look up the internal user ID (UUID) for the authenticated Clerk user
      const dbUser = await getUserByClerkId(tx, userIdFromSession);

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

        // Process into multiple download sizes (original, 512, 256, 128)
        const avatarSizeBuffers = await withTimeout(
          processAvatarToSizes(file),
          PROCESSING_TIMEOUT_MS,
          'Avatar size processing'
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
        if (!avatarUrl?.startsWith('https://')) {
          throw new TypeError('Invalid blob URL returned from storage');
        }

        // Upload each download size to blob storage
        const avatarSizes: Record<string, string> = {};
        for (const [sizeKey, buffer] of Object.entries(avatarSizeBuffers)) {
          const sizeSuffix = sizeKey === 'original' ? '-original' : `-${sizeKey}`;
          const sizeBlobPath = `avatars/users/${clerkUserId}/${seoFileName}${sizeSuffix}.avif`;
          const sizeUrl = await uploadBufferToBlob(
            put,
            sizeBlobPath,
            buffer,
            AVIF_MIME_TYPE
          );
          avatarSizes[sizeKey] = sizeUrl;
        }

        // Update record with optimized URLs
        await tx
          .update(profilePhotos)
          .set({
            blobUrl: avatarUrl,
            smallUrl: avatarSizes['128'] ?? avatarUrl,
            mediumUrl: avatarSizes['256'] ?? avatarUrl,
            largeUrl: avatarSizes['512'] ?? avatarUrl,
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

        // Get the user's profile for cache invalidation and settings update
        const [profile] = await tx
          .select({
            id: creatorProfiles.id,
            usernameNormalized: creatorProfiles.usernameNormalized,
            settings: creatorProfiles.settings,
          })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, dbUser.id))
          .limit(1);

        // Store avatar download sizes on the creator profile settings
        if (profile) {
          const currentSettings = (profile.settings ?? {}) as Record<
            string,
            unknown
          >;
          await tx
            .update(creatorProfiles)
            .set({
              settings: {
                ...currentSettings,
                avatarSizes,
              },
              updatedAt: new Date(),
            })
            .where(eq(creatorProfiles.id, profile.id));
        }

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
            largeUrl: avatarSizes['512'] ?? avatarUrl,
            mediumUrl: avatarSizes['256'] ?? avatarUrl,
            smallUrl: avatarSizes['128'] ?? avatarUrl,
            avatarSizes,
          },
          { status: 202, headers: NO_STORE_HEADERS }
        );
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
    logger.error('Avatar upload error:', error);
    await captureError('Avatar upload failed', error, {
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
}
