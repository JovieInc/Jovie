import { APP_ROUTES } from '@/constants/routes';
import { queryKeys } from '@/lib/queries';
import { getQueryClient } from '@/lib/queries/server';
import { loadAppShellRouteContext } from '../../app-shell-route-context';
import { checkBandsintownConnection } from '../../dashboard/tour-dates/actions';
import { TouringContent } from './TouringContent';

export const runtime = 'nodejs';

export default async function SettingsTouringPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_TOURING,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings touring page',
    dashboardErrorMessage:
      'Failed to load touring settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  // Prefetch Bandsintown connection status so the client component
  // gets an instant cache hit instead of showing a loading skeleton.
  const profileId = routeContext.profileId;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.tourDates.connection(profileId),
      queryFn: () => checkBandsintownConnection(),
    });
  }

  return <TouringContent />;
}
