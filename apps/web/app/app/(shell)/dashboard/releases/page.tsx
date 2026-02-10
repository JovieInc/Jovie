import { redirect } from 'next/navigation';
import { ReleaseProviderMatrix } from '@/components/dashboard/organisms/release-provider-matrix';
import { getDashboardData } from '../actions';
import {
  checkAppleMusicConnection,
  checkSpotifyConnection,
  loadReleaseMatrix,
} from './actions';
import { primaryProviderKeys, providerConfig } from './config';

export const runtime = 'nodejs';

export default async function ReleasesPage() {
  // Fetch dashboard data to verify authentication (actions handle their own auth via requireProfile)
  const dashboardData = await getDashboardData();

  // Handle unauthenticated users
  if (!dashboardData.user?.id) {
    redirect('/sign-in?redirect_url=/app/dashboard/releases');
  }

  const [releases, spotifyStatus, appleMusicStatus] = await Promise.all([
    loadReleaseMatrix(),
    checkSpotifyConnection(),
    checkAppleMusicConnection(),
  ]);

  // Read allow artwork downloads setting from profile settings
  const profileSettings =
    (dashboardData.selectedProfile?.settings as Record<string, unknown>) ?? {};
  const allowArtworkDownloads =
    (profileSettings.allowArtworkDownloads as boolean) ?? false;

  return (
    <ReleaseProviderMatrix
      releases={releases}
      providerConfig={providerConfig}
      primaryProviders={primaryProviderKeys}
      spotifyConnected={spotifyStatus.connected}
      spotifyArtistName={spotifyStatus.artistName}
      appleMusicConnected={appleMusicStatus.connected}
      appleMusicArtistName={appleMusicStatus.artistName}
      allowArtworkDownloads={allowArtworkDownloads}
    />
  );
}
