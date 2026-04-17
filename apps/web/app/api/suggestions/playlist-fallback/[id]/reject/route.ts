import { handlePlaylistFallbackMutation } from '../../_shared';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handlePlaylistFallbackMutation({
    request,
    params,
    route: '/api/suggestions/playlist-fallback/[id]/reject',
    errorMessage: 'Playlist fallback rejection failed',
    successMessage: 'Playlist suggestion dismissed',
    buildSettings: ({ playlistId, settings }) => ({
      ...settings,
      featuredPlaylistFallbackCandidate: null,
      featuredPlaylistFallbackDismissedId: playlistId,
    }),
  });
}
