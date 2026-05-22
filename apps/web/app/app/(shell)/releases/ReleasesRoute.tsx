import { APP_ROUTES } from '@/constants/routes';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { loadReleaseMatrix } from '@/lib/releases/release-matrix-loader';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { ReleasesClientBoundary } from '../dashboard/releases/ReleasesClientBoundary';
import { ReleasesPageClient } from '../dashboard/releases/ReleasesPageClient';

/**
 * Releases page — client-first with shell-only server work.
 *
 * The shared shell and /app route warm the release matrix cache ahead of
 * navigation, so this page keeps warm transitions instant while still hydrating
 * release data on direct visits, refreshes, and bookmarks.
 */
export async function ReleasesRoute() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.RELEASES,
    dashboardErrorLogMessage: 'Dashboard data load failed on releases page',
    dashboardErrorMessage:
      'Failed to load releases data. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const profileId = routeContext.profileId;
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
