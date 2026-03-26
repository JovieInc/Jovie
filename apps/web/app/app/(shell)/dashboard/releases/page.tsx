import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { HydrateClient, queryKeys } from '@/lib/queries';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
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
 * Auth check via getCachedAuth (Clerk JWT, no DB) runs first to redirect
 * unauthenticated users even during DB outages. Dashboard data loads next,
 * with error state shown if the DB fails.
 */
export default async function ReleasesPage() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_RELEASES}`
    );
  }

  const dashboardData = await getDashboardData();

  if (dashboardData.dashboardLoadError) {
    void captureError(
      'Dashboard data load failed on releases page',
      dashboardData.dashboardLoadError,
      { route: APP_ROUTES.DASHBOARD_RELEASES }
    );
    return (
      <PageErrorState message='Failed to load releases data. Please refresh the page.' />
    );
  }

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  // Prefetch releases into TanStack Query for SPA navigation cache
  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    void queryClient.prefetchQuery({
      queryKey: queryKeys.releases.matrix(profileId),
      queryFn: () => loadReleaseMatrix(profileId),
    });
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <ReleasesClientBoundary>
        <Suspense fallback={<ReleaseTableSkeleton />}>
          <ReleasesContent dashboardData={dashboardData} />
        </Suspense>
      </ReleasesClientBoundary>
    </HydrateClient>
  );
}

/**
 * Async server component that fetches all release data in parallel.
 * Wrapped in Suspense above so the skeleton shows instantly.
 */
async function ReleasesContent({
  dashboardData,
}: Readonly<{
  dashboardData: DashboardData;
}>) {
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
  );
}
