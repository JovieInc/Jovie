import { notFound } from 'next/navigation';
import { getCachedAuth } from '@/lib/auth/cached';
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
  const lyricsEnabled = await getAppFlagValue('DESIGN_V1_LYRICS', { userId });

  if (!userId || !lyricsEnabled) {
    notFound();
  }

  const dashboardData = await getDashboardShellData(userId);
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

  return (
    <LyricsPageClient
      initialLines={plainLyricsToLines(track?.lyrics ?? null)}
      initialTrack={{
        title: track?.title ?? 'No lyrics found',
        artist,
      }}
      trackId={trackId}
    />
  );
}
