import { APP_ROUTES } from '@/constants/routes';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { ThreadsPageClient } from './ThreadsPageClient';

export const runtime = 'nodejs';

export default async function ThreadsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.THREADS,
    dashboardErrorLogMessage: 'Dashboard data load failed on threads page',
    dashboardErrorMessage:
      'Failed to load threads data. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <ThreadsPageClient />
    </HydrateClient>
  );
}
