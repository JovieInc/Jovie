import { notFound } from 'next/navigation';
import { loadAppShellRouteContext } from '../../app-shell-route-context';
import { LyricsPageClient } from './LyricsPageClient';
import { loadLyricsRouteTrack } from './lyrics-data';
import { plainLyricsToLines } from './lyrics-lines';

interface Props {
  readonly params: Promise<{
    readonly trackId: string;
  }>;
}

/**
 * Lyrics route — track-scoped cinematic lyrics surface.
 *
 * Resolves the route to the current user's release, recording, or legacy
 * track lyrics. If no DB-backed lyrics exist, the client renders the empty
 * lyrics state instead of demo content.
 */
export default async function LyricsPage({ params }: Props) {
  const { trackId } = await params;
  const routeContext = await loadAppShellRouteContext({
    route: `/app/lyrics/${trackId}`,
    authFailure: 'notFound',
    requiredFlag: 'DESIGN_V1',
    dashboardErrorLogMessage: 'Dashboard data load failed on lyrics page',
    dashboardErrorMessage: 'Failed to load lyrics. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const selectedProfile = routeContext.dashboardData.selectedProfile;
  if (!selectedProfile) {
    notFound();
  }

  const artist =
    selectedProfile.displayName?.trim() ||
    selectedProfile.usernameNormalized ||
    selectedProfile.username;
  const track = await loadLyricsRouteTrack({
    profileId: selectedProfile.id,
    trackId,
    fallbackArtist: artist,
  });

  if (!track) {
    notFound();
  }

  return (
    <LyricsPageClient
      initialLines={plainLyricsToLines(track.lyrics)}
      initialTrack={{
        title: track.title,
        artist,
      }}
      initialDurationSec={
        track.durationMs ? Math.round(track.durationMs / 1000) : 0
      }
      trackId={trackId}
    />
  );
}
