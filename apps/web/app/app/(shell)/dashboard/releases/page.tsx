import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
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

  // Get shell data to check onboarding and extract profile ID for prefetch
  const dashboardData = await getDashboardShellData(userId);

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const profileId = dashboardData.selectedProfile?.id;

  // Prefetch release matrix into TanStack cache for instant client render
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
