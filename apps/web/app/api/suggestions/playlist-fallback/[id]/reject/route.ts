import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { getFeaturedPlaylistFallbackCandidate } from '@/lib/profile/featured-playlist-fallback';

const requestSchema = z.object({
  profileId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: playlistId } = await params;
    const { userId } = await getCachedAuth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { profileId } = parsed.data;

    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        clerkId: users.clerkId,
        settings: creatorProfiles.settings,
        usernameNormalized: creatorProfiles.usernameNormalized,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile || profile.clerkId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const settings = (profile.settings ?? {}) as Record<string, unknown>;
    const candidate = getFeaturedPlaylistFallbackCandidate(settings);

    if (!candidate || candidate.playlistId !== playlistId) {
      return NextResponse.json(
        { success: false, error: 'Playlist suggestion not found' },
        { status: 404 }
      );
    }

    await db
      .update(creatorProfiles)
      .set({
        settings: {
          ...settings,
          featuredPlaylistFallbackCandidate: null,
          featuredPlaylistFallbackDismissedId: playlistId,
        },
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId));

    await invalidateProfileCache(profile.usernameNormalized);

    return NextResponse.json({
      success: true,
      playlistId,
      message: 'Playlist suggestion dismissed',
    });
  } catch (error) {
    await captureError('Playlist fallback rejection failed', error, {
      route: '/api/suggestions/playlist-fallback/[id]/reject',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
