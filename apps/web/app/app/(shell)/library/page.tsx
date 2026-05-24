import { APP_ROUTES } from '@/constants/routes';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { loadReleaseMatrix } from '@/lib/releases/release-matrix-loader';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { LibraryPageClient } from './LibraryPageClient';

export const runtime = 'nodejs';

export default async function LibraryPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.LIBRARY,
    authFailure: 'notFound',
    requiredFlag: 'SHELL_CHAT_V1',
    dashboardErrorLogMessage: 'Dashboard data load failed on library page',
    dashboardErrorMessage:
      'Failed to load library data. Please refresh the page.',
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
        'Release matrix prefetch failed on library page',
        error,
        {
          route: APP_ROUTES.LIBRARY,
        }
      );
    }
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <LibraryPageClient />
    </HydrateClient>
  );
}
