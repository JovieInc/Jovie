import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, profilePhotos } from '@/lib/db';
import { avatarUploadRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs'; // Required for file upload processing

// Dynamically import Vercel Blob when needed
async function getVercelBlobUploader() {
  try {
    const blobModule = await import('@vercel/blob');
    return blobModule.put;
  } catch {
    console.warn('@vercel/blob not available, using mock implementation');
    return null;
  }
}

const uploadSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().regex(/^image\/(jpeg|png|webp)$/),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting - 3 uploads per minute per user
    if (avatarUploadRateLimit) {
      const rateLimitResult = await avatarUploadRateLimit.limit(userId);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          {
            error: 'Too many upload attempts. Please wait before trying again.',
            retryAfter: Math.round((rateLimitResult.reset - Date.now()) / 1000),
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

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file
    const validation = uploadSchema.safeParse({
      filename: file.name,
      contentType: file.type,
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
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum 4MB allowed.' },
        { status: 400 }
      );
    }

    // Create database record first
    const [photoRecord] = await db
      .insert(profilePhotos)
      .values({
        userId,
        status: 'uploading',
        originalFilename: file.name,
        mimeType: file.type,
        fileSize: file.size,
      })
      .returning();

    try {
      let blobUrl: string;

      const put = await getVercelBlobUploader();

      if (put && process.env.BLOB_READ_WRITE_TOKEN) {
        // Production: Use Vercel Blob
        const blob = await put(
          `avatars/users/${userId}/${photoRecord.id}.${file.name.split('.').pop()}`,
          file,
          {
            access: 'public',
          }
        );
        blobUrl = blob.url;
      } else {
        // Development/testing: Mock implementation
        console.warn(
          'Using mock blob implementation - configure BLOB_READ_WRITE_TOKEN for production'
        );
        blobUrl = `https://blob.vercel-storage.com/avatars/users/${userId}/${photoRecord.id}.${file.name.split('.').pop()}`;
      }

      // Update record with blob URL
      await db
        .update(profilePhotos)
        .set({
          blobUrl,
          status: 'processing', // Will be updated to 'completed' after image processing
          updatedAt: new Date(),
        })
        .where(eq(profilePhotos.id, photoRecord.id));

      return NextResponse.json(
        {
          id: photoRecord.id,
          status: 'processing',
          blobUrl,
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

      throw error;
    }
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
