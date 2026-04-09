import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { getDashboardShellData } from '../actions';
import { ReleasesClientBoundary } from './ReleasesClientBoundary';
import { ReleasesPageClient } from './ReleasesPageClient';

export const runtime = 'nodejs';

/**
 * Releases page — client-first with shell-only server work.
 *
 * Auth check via getCachedAuth (Clerk JWT, no DB) runs first. The shared shell
 * and /app route warm the release matrix cache ahead of navigation, so this
 * page avoids an extra blocking server prefetch on warm transitions. Cold
 * loads still fall back to the client skeleton while the query resolves.
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

  return (
    <ReleasesClientBoundary>
      <ReleasesPageClient />
    </ReleasesClientBoundary>
  );
}
