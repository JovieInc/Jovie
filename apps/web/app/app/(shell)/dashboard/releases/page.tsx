import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix';
import { captureError } from '@/lib/error-tracking';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';
import type { DashboardData } from '../actions/dashboard-data';
import {
  checkAppleMusicConnection,
  checkSpotifyConnection,
  loadReleaseMatrix,
} from './actions';
import { primaryProviderKeys, providerConfig } from './config';
import { ReleaseTableSkeleton } from './loading';
import { ReleasesClientBoundary } from './ReleasesClientBoundary';

export const runtime = 'nodejs';

/**
 * Releases page — streams instantly after auth gate.
 *
 * Auth check (getDashboardData) blocks navigation because we need to redirect
 * unauthenticated/onboarding users. Everything else loads inside a Suspense
 * boundary so the skeleton renders immediately while data fetches in parallel.
 */
export default async function ReleasesPage() {
  const dashboardData = await getDashboardData();

  if (!dashboardData.user?.id) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_RELEASES}`
    );
  }

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  return (
    <ReleasesClientBoundary>
      <Suspense fallback={<ReleaseTableSkeleton />}>
        <ReleasesContent dashboardData={dashboardData} />
      </Suspense>
    </ReleasesClientBoundary>
  );
}

/**
 * Async server component that fetches all release data in parallel.
 * Wrapped in Suspense above so the skeleton shows instantly.
 */
async function ReleasesContent({
  dashboardData,
}: {
  dashboardData: DashboardData;
}) {
  // Fire all fetches in parallel — no sequential waterfall
  const [releasesResult, spotifyResult, appleMusicResult] =
    await Promise.allSettled([
      loadReleaseMatrix(),
      checkSpotifyConnection(),
      checkAppleMusicConnection(),
    ]);

  // Handle releases — check for redirect errors, extract value
  let releases: Awaited<ReturnType<typeof loadReleaseMatrix>> = [];
  if (releasesResult.status === 'fulfilled') {
    releases = releasesResult.value;
  } else {
    throwIfRedirect(releasesResult.reason);
    void captureError('loadReleaseMatrix failed', releasesResult.reason, {
      route: APP_ROUTES.RELEASES,
    });
  }

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
  const spotifyImportStatus =
    (profileSettings.spotifyImportStatus as string) ?? 'idle';
  const spotifyImportTotal =
    typeof profileSettings.spotifyImportTotal === 'number'
      ? profileSettings.spotifyImportTotal
      : 0;
  return (
    <ReleasesClientBoundary>
      <ReleasesExperience
        releases={releases}
        providerConfig={providerConfig}
        primaryProviders={primaryProviderKeys}
        spotifyConnected={spotifyStatus.connected}
        spotifyArtistName={spotifyStatus.artistName}
        appleMusicConnected={appleMusicStatus.connected}
        appleMusicArtistName={appleMusicStatus.artistName}
        allowArtworkDownloads={allowArtworkDownloads}
        initialImporting={spotifyImportStatus === 'importing'}
        initialTotalCount={spotifyImportTotal}
      />
    </ReleasesClientBoundary>
  );
}
