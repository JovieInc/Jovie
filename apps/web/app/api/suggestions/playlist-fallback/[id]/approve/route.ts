import { handlePlaylistFallbackMutation } from '../../_shared';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handlePlaylistFallbackMutation({
    request,
    params,
    route: '/api/suggestions/playlist-fallback/[id]/approve',
    errorMessage: 'Playlist fallback approval failed',
    successMessage: 'Playlist fallback confirmed',
    buildSettings: ({ candidate, playlistId, settings }) => ({
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
    }),
  });
}
