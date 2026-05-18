import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { loadReleaseMatrix } from '@/lib/releases/release-matrix-loader';
import { getDashboardShellData } from '../dashboard/actions';
import { ReleasesClientBoundary } from '../dashboard/releases/ReleasesClientBoundary';
import { ReleasesPageClient } from '../dashboard/releases/ReleasesPageClient';

/**
 * Releases page — client-first with shell-only server work.
 *
 * Auth check via getCachedAuth (Clerk JWT, no DB) runs first. The shared shell
 * and /app route warm the release matrix cache ahead of navigation, so this
 * page keeps warm transitions instant while still hydrating release data on
 * direct visits, refreshes, and bookmarks.
 */
export async function ReleasesRoute() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    const signInParams = new URLSearchParams({
      redirect_url: APP_ROUTES.RELEASES,
    });
    redirect(`${APP_ROUTES.SIGNIN}?${signInParams.toString()}`);
  }

  // Shell data is cached from the shell layout (same request) — resolves instantly.
  const dashboardData = await getDashboardShellData(userId);

  if (dashboardData.dashboardLoadError) {
    void captureError(
      'Dashboard data load failed on releases page',
      dashboardData.dashboardLoadError,
      { route: APP_ROUTES.RELEASES }
    );
    return (
      <PageErrorState message='Failed to load releases data. Please refresh the page.' />
    );
  }

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.START);
  }

  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    try {
      await queryClient.fetchQuery({
        queryKey: queryKeys.releases.matrix(profileId),
        queryFn: () => loadReleaseMatrix(profileId),
      });
    } catch (error) {
      void captureError(
        'Release matrix prefetch failed on releases page',
        error,
        {
          route: APP_ROUTES.RELEASES,
        }
      );
    }
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <ReleasesClientBoundary>
        <ReleasesPageClient />
      </ReleasesClientBoundary>
    </HydrateClient>
  );
}
