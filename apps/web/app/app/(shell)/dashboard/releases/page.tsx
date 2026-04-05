import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardShellData } from '../actions';
import {
  checkAppleMusicConnectionForProfile,
  checkSpotifyConnectionForProfile,
  loadReleaseMatrixForProfile,
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

  return (
    <ReleasesClientBoundary>
      <Suspense fallback={<ReleaseTableSkeleton showHeader={false} />}>
        <ReleasesContent userId={userId} />
      </Suspense>
    </ReleasesClientBoundary>
  );
}

/**
 * Async server component that fetches all release data in parallel.
 * Wrapped in Suspense above so the skeleton shows instantly.
 */
async function ReleasesContent({ userId }: Readonly<{ userId: string }>) {
  const dashboardData = await getDashboardShellData(userId);

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

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const selectedProfile = dashboardData.selectedProfile;
  if (!selectedProfile) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const releaseProfile = {
    userId,
    profileId: selectedProfile.id,
    profileHandle:
      selectedProfile.usernameNormalized ?? selectedProfile.username,
    spotifyId: selectedProfile.spotifyId ?? null,
    appleMusicId: selectedProfile.appleMusicId ?? null,
    settings:
      (selectedProfile.settings as Record<string, unknown> | null) ?? null,
  };

  const profileSettings =
    (selectedProfile.settings as Record<string, unknown>) ?? {};
  // Fire all fetches in parallel — no sequential waterfall
  const [releasesResult, spotifyResult, appleMusicResult] =
    await Promise.allSettled([
      loadReleaseMatrixForProfile(releaseProfile),
      checkSpotifyConnectionForProfile(releaseProfile),
      checkAppleMusicConnectionForProfile(releaseProfile),
    ]);

  // Handle releases — check for redirect errors, extract value
  let releases: Awaited<ReturnType<typeof loadReleaseMatrixForProfile>> = [];
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
