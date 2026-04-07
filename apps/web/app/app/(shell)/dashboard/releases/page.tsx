import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { getDashboardShellData } from '../actions';
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
  // Release matrix prefetch is already started at the shell level (DashboardShellContent)
  // in parallel with the shell data fetch, so it may already be in the query cache.
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

  return (
    <ReleasesClientBoundary>
      <HydrateClient state={getDehydratedState()}>
        <ReleasesPageClient />
      </HydrateClient>
    </ReleasesClientBoundary>
  );
}
