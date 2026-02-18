import { redirect } from 'next/navigation';
import { ReleaseProviderMatrix } from '@/components/dashboard/organisms/release-provider-matrix';
import { APP_ROUTES } from '@/constants/routes';
import { captureError } from '@/lib/error-tracking';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
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

  // Handle redirects for users who need onboarding
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  // Fetch releases outside allSettled so redirect() from requireProfile() can propagate
  let releases: Awaited<ReturnType<typeof loadReleaseMatrix>> = [];
  try {
    releases = await loadReleaseMatrix();
  } catch (error) {
    throwIfRedirect(error);
    void captureError('loadReleaseMatrix failed', error, {
      route: APP_ROUTES.RELEASES,
    });
  }

  // Use allSettled for connection checks — these don't redirect and degrade gracefully
  const [spotifyResult, appleMusicResult] = await Promise.allSettled([
    checkSpotifyConnection(),
    checkAppleMusicConnection(),
  ]);

  const spotifyStatus =
    spotifyResult.status === 'fulfilled'
      ? spotifyResult.value
      : { connected: false, spotifyId: null, artistName: null };
  const appleMusicStatus =
    appleMusicResult.status === 'fulfilled'
      ? appleMusicResult.value
      : { connected: false, artistName: null, artistId: null };

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
