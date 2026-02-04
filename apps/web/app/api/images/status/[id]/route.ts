import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { profilePhotos } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

// UUID v4 regex pattern for validation
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { id: photoId } = await context.params;
    if (!photoId) {
      return NextResponse.json(
        { error: 'Photo ID required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Validate UUID format to prevent injection attacks
    if (!isValidUUID(photoId)) {
      return NextResponse.json(
        { error: 'Invalid photo ID format' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Verify user exists and get their internal ID
    const user = await getUserByClerkId(db, clerkUserId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Get photo record - ensure user owns it
    const [photo] = await db
      .select()
      .from(profilePhotos)
      .where(
        and(eq(profilePhotos.id, photoId), eq(profilePhotos.userId, user.id))
      )
      .limit(1);

    if (!photo) {
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        jobId: photo.id,
        status: photo.status,
        formats: {
          webp: {
            original: photo.blobUrl,
            large: photo.largeUrl,
            medium: photo.mediumUrl,
            small: photo.smallUrl,
          },
          avif: null, // reserved for background worker output
          jpeg: null, // reserved for background worker output
        },
        processedAt: photo.processedAt,
        errorMessage: photo.errorMessage,
        createdAt: photo.createdAt,
        updatedAt: photo.updatedAt,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Photo status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
