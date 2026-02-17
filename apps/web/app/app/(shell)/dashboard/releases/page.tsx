import { redirect } from 'next/navigation';
import { ReleaseProviderMatrix } from '@/components/dashboard/organisms/release-provider-matrix';
import { APP_ROUTES } from '@/constants/routes';
import { captureError } from '@/lib/error-tracking';
import { getDashboardData } from '../actions';
import {
  checkAppleMusicConnection,
  checkSpotifyConnection,
  loadReleaseMatrix,
} from './actions';
import { primaryProviderKeys, providerConfig } from './config';
import { ReleasesClientBoundary } from './ReleasesClientBoundary';

export const runtime = 'nodejs';

export default async function ReleasesPage() {
  // Fetch dashboard data to verify authentication (actions handle their own auth via requireProfile)
  const dashboardData = await getDashboardData();

  // Handle unauthenticated users
  if (!dashboardData.user?.id) {
    redirect('/sign-in?redirect_url=/app/dashboard/releases');
  }

  // Use allSettled so a single fetch failure degrades gracefully instead of crashing
  const [releasesResult, spotifyResult, appleMusicResult] =
    await Promise.allSettled([
      loadReleaseMatrix(),
      checkSpotifyConnection(),
      checkAppleMusicConnection(),
    ]);

  const releases =
    releasesResult.status === 'fulfilled' ? releasesResult.value : [];
  const spotifyStatus =
    spotifyResult.status === 'fulfilled'
      ? spotifyResult.value
      : { connected: false, spotifyId: null, artistName: null };
  const appleMusicStatus =
    appleMusicResult.status === 'fulfilled'
      ? appleMusicResult.value
      : { connected: false, artistName: null, artistId: null };

  if (releasesResult.status === 'rejected') {
    void captureError('loadReleaseMatrix failed', releasesResult.reason, {
      route: APP_ROUTES.RELEASES,
    });
  }
  if (spotifyResult.status === 'rejected') {
    void captureError('checkSpotifyConnection failed', spotifyResult.reason, {
      route: APP_ROUTES.RELEASES,
    });
  }
  if (appleMusicResult.status === 'rejected') {
    void captureError(
      'checkAppleMusicConnection failed',
      appleMusicResult.reason,
      {
        route: APP_ROUTES.RELEASES,
      }
    );
  }

  // Read allow artwork downloads setting from profile settings
  const profileSettings =
    (dashboardData.selectedProfile?.settings as Record<string, unknown>) ?? {};
  const allowArtworkDownloads =
    (profileSettings.allowArtworkDownloads as boolean) ?? false;

  return (
    <ReleasesClientBoundary>
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
    </ReleasesClientBoundary>
  );
}
