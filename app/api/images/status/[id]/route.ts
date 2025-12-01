import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db, profilePhotos, users } from '@/lib/db';

export const runtime = 'edge';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const photoId = params.id;
    if (!photoId) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 });
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
