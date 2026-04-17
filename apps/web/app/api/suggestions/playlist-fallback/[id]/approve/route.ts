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

    const { candidate, playlistId, profileId, settings, usernameNormalized } =
      context;

    const nextSettings = {
      ...settings,
      featuredPlaylistFallback: {
        ...candidate,
        confirmedAt: new Date().toISOString(),
      },
      featuredPlaylistFallbackCandidate: null,
      featuredPlaylistFallbackDismissedId:
        settings.featuredPlaylistFallbackDismissedId === playlistId
          ? null
          : settings.featuredPlaylistFallbackDismissedId,
    };

    await db
      .update(creatorProfiles)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId));

    await invalidateProfileCache(usernameNormalized);

    return NextResponse.json({
      success: true,
      playlistId,
      message: 'Playlist fallback confirmed',
    });
  } catch (error) {
    await captureError('Playlist fallback approval failed', error, {
      route: '/api/suggestions/playlist-fallback/[id]/approve',
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
