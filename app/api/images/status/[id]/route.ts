import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, profilePhotos, users } from '@/lib/db';

export const runtime = 'edge';

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: photoId } = await context.params;
    if (!photoId) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 });
    }

    // Validate UUID format to prevent injection attacks
    if (!isValidUUID(photoId)) {
      return NextResponse.json(
        { error: 'Invalid photo ID format' },
        { status: 400 }
      );
    }

    // Get photo record - ensure user owns it by matching Clerk user to internal UUID
    const [row] = await db
      .select({ photo: profilePhotos })
      .from(profilePhotos)
      .innerJoin(users, eq(users.id, profilePhotos.userId))
      .where(and(eq(profilePhotos.id, photoId), eq(users.clerkId, clerkUserId)))
      .limit(1);

    const photo = row?.photo;

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: photo.id,
      status: photo.status,
      blobUrl: photo.blobUrl,
      smallUrl: photo.smallUrl,
      mediumUrl: photo.mediumUrl,
      largeUrl: photo.largeUrl,
      processedAt: photo.processedAt,
      errorMessage: photo.errorMessage,
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    });
  } catch (error) {
    console.error('Photo status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
