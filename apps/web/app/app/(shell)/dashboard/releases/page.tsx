import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { getDashboardShellData } from '../actions';
import { loadReleaseMatrix } from './actions';
import { ReleasesClientBoundary } from './ReleasesClientBoundary';
import { ReleasesPageClient } from './ReleasesPageClient';

export const runtime = 'nodejs';

/**
 * Releases page — client-first with server prefetch.
 *
 * Auth check via getCachedAuth (Clerk JWT, no DB) runs first. On first visit,
 * the release matrix is prefetched into TanStack Query cache and hydrated to
 * the client. On subsequent navigations, the client component renders from
 * cache instantly (no skeleton), with background refetch if stale.
 */
export default async function ReleasesPage() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_RELEASES}`
    );
  }

  // Shell data is cached from the shell layout (same request) — resolves instantly.
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

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  // Prefetch release matrix into TanStack cache — must await to guarantee
  // the data is included in getDehydratedState() (no loading skeleton).
  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.releases.matrix(profileId),
      queryFn: () => loadReleaseMatrix(profileId),
    });
  }

  return (
    <ReleasesClientBoundary>
      <HydrateClient state={getDehydratedState()}>
        <ReleasesPageClient />
      </HydrateClient>
    </ReleasesClientBoundary>
  );
}
