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
import { avatarUploadRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs'; // Required for file upload processing

type BlobPut = typeof import('@vercel/blob').put;
type SharpModule = typeof import('sharp');
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

async function getSharp(): Promise<SharpModule> {
  const sharpModule = await import('sharp');
  return (sharpModule as { default?: SharpModule }).default ?? sharpModule;
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

async function uploadBufferToBlob(
  put: BlobPut | null,
  path: string,
  buffer: Buffer
): Promise<string> {
  if (put && process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(path, buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: WEBP_MIME_TYPE,
      cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 year
      addRandomSuffix: false,
    });
    return blob.url;
  }

  // Development/test fallback keeps deterministic URLs while avoiding network writes
  return `https://blob.vercel-storage.com/${path}`;
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

export async function POST(request: NextRequest) {
  try {
    return await withDbSession(async clerkUserId => {
      // Rate limiting - 3 uploads per minute per user
      if (avatarUploadRateLimit) {
        const rateLimitResult = await avatarUploadRateLimit.limit(clerkUserId);
        if (!rateLimitResult.success) {
          return NextResponse.json(
            {
              error:
                'Too many upload attempts. Please wait before trying again.',
              retryAfter: Math.round(
                (rateLimitResult.reset - Date.now()) / 1000
              ),
            },
            {
              status: 429,
              headers: {
                'Retry-After': Math.round(
                  (rateLimitResult.reset - Date.now()) / 1000
                ).toString(),
                'X-RateLimit-Limit': rateLimitResult.limit.toString(),
                'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
                'X-RateLimit-Reset': new Date(
                  rateLimitResult.reset
                ).toISOString(),
              },
            }
          );
        }
      }

      // Validate content type and size
      const contentType = request.headers.get('content-type');
      if (!contentType?.startsWith('multipart/form-data')) {
        return NextResponse.json(
          { error: 'Invalid content type' },
          { status: 400 }
        );
      }

      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const normalizedType = (file?.type.toLowerCase?.() ?? '') as
        | SupportedImageMimeType
        | '';

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file
      const validation = uploadSchema.safeParse({
        filename: file.name,
        contentType: normalizedType,
      });

      if (!validation.success) {
        return NextResponse.json(
          {
            error: 'Invalid file',
            details: validation.error.issues,
          },
          { status: 400 }
        );
      }

      // Check file size (4MB limit)
      if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'File too large. Maximum 4MB allowed.' },
          { status: 400 }
        );
      }

      // Look up the internal user ID (UUID) for the authenticated Clerk user
      const [dbUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!dbUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
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

        const optimized = await optimizeImageToWebp(file);
        const seoFileName = buildSeoFilename({
          originalFilename: file.name,
          photoId: photoRecord.id,
        });
        const blobPaths = buildBlobPaths(seoFileName, clerkUserId);
        const put = await getVercelBlobUploader();

        const [blobUrl, largeUrl, mediumUrl, smallUrl] = await Promise.all([
          uploadBufferToBlob(put, blobPaths.original, optimized.original.data),
          uploadBufferToBlob(put, blobPaths.large, optimized.large),
          uploadBufferToBlob(put, blobPaths.medium, optimized.medium),
          uploadBufferToBlob(put, blobPaths.small, optimized.small),
        ]);

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
        // Update record with error status
        await db
          .update(profilePhotos)
          .set({
            status: 'failed',
            errorMessage:
              error instanceof Error ? error.message : 'Upload failed',
            updatedAt: new Date(),
          })
          .where(eq(profilePhotos.id, photoRecord.id));

        const message = error instanceof Error ? error.message : '';
        const lowerMessage = message.toLowerCase();
        const isInvalidImage =
          lowerMessage.includes('unsupported image format') ||
          lowerMessage.includes('input buffer') ||
          lowerMessage.includes('invalid');

        if (isInvalidImage) {
          return NextResponse.json(
            {
              error: 'Invalid image file. Please upload a supported image.',
            },
            { status: 400 }
          );
        }

        throw error;
      }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
