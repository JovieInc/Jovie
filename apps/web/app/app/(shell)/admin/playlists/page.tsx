import { and, desc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { AdminWorkspacePage } from '@/components/features/admin/layout/AdminWorkspacePage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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

async function requireAdmin(): Promise<void> {
  const { userId } = await getCachedAuth();
  if (!userId || !(await checkAdminRole(userId))) {
    throw new Error('Unauthorized');
  }
}

export const metadata: Metadata = { title: 'Playlists — Admin' };
export const runtime = 'nodejs';

// ============================================================================
// Server Actions
// ============================================================================

async function approvePlaylist(formData: FormData) {
  'use server';

  await requireAdmin();

  const playlistId = formData.get('playlistId') as string;
  if (!playlistId) return;

  // Atomic claim: only proceed if status is still 'pending'
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

  if (!playlist) return; // already claimed by another request

  try {
    const tracks = await db
      .select()
      .from(joviePlaylistTracks)
      .where(eq(joviePlaylistTracks.playlistId, playlistId))
      .orderBy(joviePlaylistTracks.position);

    const trackIds = tracks
      .map(t => t.spotifyTrackId)
      .filter((id): id is string => id != null);

    // Generate cover art using LLM-generated queries from the pipeline
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

    // Publish to Spotify
    const result = await publishToSpotify({
      title: playlist.title,
      description: playlist.description ?? '',
      trackIds,
      coverBase64: coverArt.spotifyBase64,
      slug: playlist.slug,
    });

    // Get Spotify user ID for audit trail
    const spotifyUserId = await getJovieSpotifyUserId();

    // Update playlist status to published
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
    // Revert to pending so the admin can retry (prevents "approved" limbo).
    // Preserve the original publish error if the revert itself fails.
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

async function rejectPlaylist(formData: FormData) {
  'use server';

  await requireAdmin();

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

// ============================================================================
// Data
// ============================================================================

async function getPlaylists(status: string) {
  return db
    .select({
      id: joviePlaylists.id,
      title: joviePlaylists.title,
      slug: joviePlaylists.slug,
      status: joviePlaylists.status,
      trackCount: joviePlaylists.trackCount,
      genreTags: joviePlaylists.genreTags,
      createdAt: joviePlaylists.createdAt,
      publishedAt: joviePlaylists.publishedAt,
      spotifyPlaylistId: joviePlaylists.spotifyPlaylistId,
    })
    .from(joviePlaylists)
    .where(
      eq(joviePlaylists.status, status as 'pending' | 'published' | 'rejected')
    )
    .orderBy(desc(joviePlaylists.createdAt))
    .limit(50);
}

// ============================================================================
// Page
// ============================================================================

type PlaylistTab = 'pending' | 'published' | 'rejected';

const TAB_OPTIONS = [
  { value: 'pending' as const, label: 'Pending' },
  { value: 'published' as const, label: 'Published' },
  { value: 'rejected' as const, label: 'Rejected' },
] as const;

export default async function AdminPlaylistsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ tab?: string }>;
}>) {
  const { tab = 'pending' } = await searchParams;
  const currentTab = (
    ['pending', 'published', 'rejected'].includes(tab) ? tab : 'pending'
  ) as PlaylistTab;
  const playlists = await getPlaylists(currentTab);

  return (
    <AdminWorkspacePage
      title='Playlists'
      description='Review and approve auto-generated playlists.'
      primaryParam='tab'
      primaryValue={currentTab}
      primaryOptions={TAB_OPTIONS}
      testId='admin-playlists'
    >
      {/* Playlist list */}
      {playlists.length === 0 ? (
        <div className='py-16 text-center text-app text-white/40'>
          {tab === 'pending'
            ? 'No pending playlists. Next one generates at 6:00 AM UTC.'
            : `No ${tab} playlists.`}
        </div>
      ) : (
        <div className='space-y-3'>
          {playlists.map(playlist => (
            <ContentSurfaceCard key={playlist.id} className='p-4'>
              <div className='flex items-start justify-between'>
                <div>
                  <h3 className='text-mid font-medium text-white'>
                    {playlist.title}
                  </h3>
                  <p className='mt-1 text-app text-white/40'>
                    {playlist.trackCount} tracks
                    {playlist.genreTags?.length
                      ? ` \u2022 ${playlist.genreTags.join(', ')}`
                      : ''}
                    {' \u2022 '}
                    {new Date(playlist.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {tab === 'pending' && (
                  <div className='flex gap-2'>
                    <form action={approvePlaylist}>
                      <input
                        type='hidden'
                        name='playlistId'
                        value={playlist.id}
                      />
                      <button
                        type='submit'
                        className='rounded-md bg-[#1DB954] px-3 py-1.5 text-app font-medium text-white hover:opacity-90'
                      >
                        Approve
                      </button>
                    </form>
                    <form action={rejectPlaylist}>
                      <input
                        type='hidden'
                        name='playlistId'
                        value={playlist.id}
                      />
                      <button
                        type='submit'
                        className='rounded-md bg-white/5 px-3 py-1.5 text-app font-book text-white/60 hover:bg-white/10'
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                )}

                {tab === 'published' && playlist.spotifyPlaylistId && (
                  <a
                    href={`https://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-app text-[#1DB954] hover:underline'
                  >
                    View on Spotify
                  </a>
                )}
              </div>
            </ContentSurfaceCard>
          ))}
        </div>
      )}
    </AdminWorkspacePage>
  );
}
