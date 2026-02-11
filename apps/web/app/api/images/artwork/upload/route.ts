import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { withDbSessionTx } from '@/lib/auth/session';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { artworkUploadLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/utils/logger';
import {
  AVIF_MIME_TYPE,
  errorResponse,
  getVercelBlobUploader,
  NO_STORE_HEADERS,
  PROCESSING_TIMEOUT_MS,
  UPLOAD_ERROR_CODES,
  validateUploadedFile,
  withTimeout,
} from '../../upload/lib';
import { processArtworkToSizes } from './process';

export const runtime = 'nodejs';

/**
 * Upload processed artwork buffers to blob storage, returning a map of size keys to URLs.
 */
async function uploadArtworkSizes(
  processed: Record<string, Buffer>,
  releaseId: string,
  put: Awaited<ReturnType<typeof getVercelBlobUploader>>,
  token: string | undefined
): Promise<Record<string, string>> {
  const sizes: Record<string, string> = {};

  for (const [sizeKey, buffer] of Object.entries(processed)) {
    const blobPath = `artwork/releases/${releaseId}/${sizeKey}.avif`;

    if (!put || !token) {
      if (process.env.NODE_ENV === 'production') {
        throw new TypeError('Blob storage not configured');
      }
      sizes[sizeKey] = `https://blob.vercel-storage.com/${blobPath}`;
      continue;
    }

    const blob = await withTimeout(
      put(blobPath, buffer, {
        access: 'public',
        token,
        contentType: AVIF_MIME_TYPE,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        addRandomSuffix: false,
      }),
      PROCESSING_TIMEOUT_MS,
      `Blob upload (${sizeKey})`
    );

    if (!blob.url?.startsWith('https://')) {
      throw new TypeError('Invalid blob URL returned from storage');
    }

    sizes[sizeKey] = blob.url;
  }

  return sizes;
}

/**
 * Build original artwork snapshot fields when first custom upload replaces DSP artwork.
 */
function buildOriginalArtworkFields(
  existingMetadata: Record<string, unknown>,
  currentArtworkUrl: string | null
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (!existingMetadata.originalArtworkUrl && currentArtworkUrl) {
    fields.originalArtworkUrl = currentArtworkUrl;
    if (existingMetadata.artworkSizes) {
      fields.originalArtworkSizes = existingMetadata.artworkSizes;
    }
  }
  return fields;
}

/** Artwork size presets for downloads */
export const ARTWORK_SIZES = {
  original: null, // Keep original dimensions (up to 3000px)
  '1000': 1000,
  '500': 500,
  '250': 250,
} as const;

export type ArtworkSizeKey = keyof typeof ARTWORK_SIZES;

export interface ArtworkUploadResult {
  artworkUrl: string;
  sizes: Partial<Record<ArtworkSizeKey, string>>;
}

export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return errorResponse(
      'Please sign in to upload artwork.',
      UPLOAD_ERROR_CODES.UNAUTHORIZED,
      401
    );
  }

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
      // Rate limiting
      const rateLimitResult =
        await artworkUploadLimiter.limit(userIdFromSession);
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

      // Validate file
      const validationResult = await validateUploadedFile(request);
      if (validationResult instanceof NextResponse) {
        return validationResult;
      }

      const { file } = validationResult;

      // Extract releaseId from form data (already consumed, get from URL params)
      const releaseId = request.nextUrl.searchParams.get('releaseId');
      const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!releaseId || !UUID_RE.test(releaseId)) {
        return errorResponse(
          'A valid Release ID is required.',
          UPLOAD_ERROR_CODES.INVALID_FILE,
          400
        );
      }

      // Look up user
      const dbUser = await getUserByClerkId(tx, userIdFromSession);
      if (!dbUser) {
        return errorResponse(
          'User account not found. Please sign in again.',
          UPLOAD_ERROR_CODES.USER_NOT_FOUND,
          404
        );
      }

      // Verify release belongs to this user
      const [release] = await tx
        .select({
          id: discogReleases.id,
          creatorProfileId: discogReleases.creatorProfileId,
          slug: discogReleases.slug,
          artworkUrl: discogReleases.artworkUrl,
          metadata: discogReleases.metadata,
        })
        .from(discogReleases)
        .where(eq(discogReleases.id, releaseId))
        .limit(1);

      if (!release) {
        return errorResponse(
          'Release not found.',
          UPLOAD_ERROR_CODES.INVALID_FILE,
          404
        );
      }

      // Verify ownership
      const [profile] = await tx
        .select({ id: creatorProfiles.id, userId: creatorProfiles.userId })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, release.creatorProfileId))
        .limit(1);

      if (profile?.userId !== dbUser.id) {
        return errorResponse(
          'You do not have permission to modify this release.',
          UPLOAD_ERROR_CODES.UNAUTHORIZED,
          403
        );
      }

      // Process image to multiple sizes
      const processed = await withTimeout(
        processArtworkToSizes(file),
        PROCESSING_TIMEOUT_MS,
        'Artwork processing'
      );

      const put = await getVercelBlobUploader();
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      const sizes = await uploadArtworkSizes(processed, releaseId, put, token);

      // Primary artwork URL is the 1000px version (good balance of quality/size)
      const artworkUrl = sizes['1000'] ?? sizes.original;
      if (!artworkUrl) {
        return errorResponse(
          'Image processing produced no usable sizes. Please try a different image.',
          UPLOAD_ERROR_CODES.UPLOAD_FAILED,
          422
        );
      }

      // Update the release record, preserving the original (DSP-ingested) artwork
      const existingMetadata =
        (release.metadata as Record<string, unknown>) ?? {};
      const originalFields = buildOriginalArtworkFields(
        existingMetadata,
        release.artworkUrl
      );

      await tx
        .update(discogReleases)
        .set({
          artworkUrl,
          metadata: {
            ...existingMetadata,
            ...originalFields,
            artworkSizes: sizes,
          },
          updatedAt: new Date(),
        })
        .where(eq(discogReleases.id, releaseId));

      return NextResponse.json(
        {
          artworkUrl,
          sizes,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    });
  } catch (error) {
    logger.error('Artwork upload error:', error);
    await captureError('Artwork upload failed', error, {
      route: '/api/images/artwork/upload',
      method: 'POST',
    });

    if (error instanceof Error && error.message === 'Unauthorized') {
      return errorResponse(
        'Please sign in to upload artwork.',
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
