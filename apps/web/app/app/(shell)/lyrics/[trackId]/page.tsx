import { notFound, redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { getDashboardShellData } from '../../dashboard/actions';
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
  const { userId } = await getCachedAuth();
  const lyricsEnabled = await getAppFlagValue('DESIGN_V1', { userId });

  if (!userId || !lyricsEnabled) {
    notFound();
  }

  const dashboardData = await getDashboardShellData(userId);
  if (dashboardData.dashboardLoadError) {
    await captureError(
      'Dashboard data load failed on lyrics page',
      dashboardData.dashboardLoadError,
      { route: `/app/lyrics/${trackId}` }
    );
    return (
      <PageErrorState message='Failed to load lyrics. Please refresh the page.' />
    );
  }

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const selectedProfile = dashboardData.selectedProfile;
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
      trackId={trackId}
    />
  );
}
