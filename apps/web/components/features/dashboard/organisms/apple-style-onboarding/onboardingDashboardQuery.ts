export type SpotifyImportStatus = 'idle' | 'importing' | 'success' | 'error';

export const getOnboardingDashboardInitialQuery = (
  spotifyImportStatus: SpotifyImportStatus
): string =>
  spotifyImportStatus === 'success'
    ? 'Show me my latest releases'
    : 'Connect my Spotify';
