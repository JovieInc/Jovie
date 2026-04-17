import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { getPlaylistFallbackRequestContext } from '../../_shared';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getPlaylistFallbackRequestContext(request, params);

    if (context instanceof NextResponse) {
      return context;
    }

    const { playlistId, profileId, settings, usernameNormalized } = context;

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

    await invalidateProfileCache(usernameNormalized);

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
