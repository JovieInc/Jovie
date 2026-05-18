'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { joviePlaylists, joviePlaylistTracks } from '@/lib/db/schema/playlists';
import { captureError } from '@/lib/error-tracking';
import { generateCoverArt } from '@/lib/playlists/generate-cover';
import { publishToSpotify } from '@/lib/playlists/publish-spotify';
import { uploadPlaylistCoverImage } from '@/lib/playlists/upload-cover-image';
import { getJovieSpotifyUserId } from '@/lib/spotify/jovie-account';

async function requireAdminAction(): Promise<void> {
  const { userId } = await getCachedAuth();
  if (!userId || !(await checkAdminRole(userId))) {
    throw new Error('Unauthorized');
  }
}

export async function approvePlaylist(formData: FormData) {
  await requireAdminAction();

  const playlistId = formData.get('playlistId') as string;
  if (!playlistId) return;

  // Atomic claim: only proceed if status is still 'pending'.
  const [playlist] = await db
    .update(joviePlaylists)
    .set({
      status: 'approved',
      statusChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(joviePlaylists.id, playlistId),
        eq(joviePlaylists.status, 'pending')
      )
    )
    .returning();

  if (!playlist) return;

  try {
    const tracks = await db
      .select()
      .from(joviePlaylistTracks)
      .where(eq(joviePlaylistTracks.playlistId, playlistId))
      .orderBy(joviePlaylistTracks.position);

    const trackIds = tracks
      .map(t => t.spotifyTrackId)
      .filter((id): id is string => id != null);

    const promptData = (() => {
      try {
        return playlist.llmPrompt
          ? (JSON.parse(playlist.llmPrompt) as {
              unsplashQuery?: string;
              coverTextWords?: string;
            })
          : {};
      } catch {
        return {};
      }
    })();
    const coverArt = await generateCoverArt({
      unsplashQuery:
        promptData.unsplashQuery ?? playlist.theme ?? playlist.title,
      coverText:
        promptData.coverTextWords ??
        playlist.title.split(' ').slice(0, 4).join(' '),
    });
    const coverImageUrl = await uploadPlaylistCoverImage({
      slug: playlist.slug,
      imageBuffer: coverArt.fullResBuffer,
    });

    const result = await publishToSpotify({
      title: playlist.title,
      description: playlist.description ?? '',
      trackIds,
      coverBase64: coverArt.spotifyBase64,
      slug: playlist.slug,
    });

    const spotifyUserId = await getJovieSpotifyUserId();

    await db
      .update(joviePlaylists)
      .set({
        status: 'published',
        statusChangedAt: new Date(),
        publishedAt: new Date(),
        spotifyPlaylistId: result.spotifyPlaylistId,
        curatorSpotifyUserId: spotifyUserId,
        trackCount: result.tracksAdded,
        coverImageUrl,
        coverImageFullUrl: coverImageUrl,
        updatedAt: new Date(),
      })
      .where(eq(joviePlaylists.id, playlistId));

    revalidatePath('/playlists');
    revalidatePath(`/playlists/${playlist.slug}`);
  } catch (error) {
    try {
      await db
        .update(joviePlaylists)
        .set({
          status: 'pending',
          statusChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(joviePlaylists.id, playlistId));
    } catch (revertError) {
      captureError('[Admin Playlists] Revert to pending failed', revertError, {
        playlistId,
        originalError: error instanceof Error ? error.message : String(error),
      });
    }

    throw error;
  }

  revalidatePath(APP_ROUTES.ADMIN_PLAYLISTS);
}

export async function rejectPlaylist(formData: FormData) {
  await requireAdminAction();

  const playlistId = formData.get('playlistId') as string;
  const note = formData.get('note') as string;
  if (!playlistId) return;

  const [rejectedPlaylist] = await db
    .update(joviePlaylists)
    .set({
      status: 'rejected',
      statusChangedAt: new Date(),
      rejectionNote: note || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(joviePlaylists.id, playlistId),
        eq(joviePlaylists.status, 'pending')
      )
    )
    .returning({ id: joviePlaylists.id });

  if (!rejectedPlaylist) return;

  revalidatePath(APP_ROUTES.ADMIN_PLAYLISTS);
}
