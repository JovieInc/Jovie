import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { loadAppShellRouteContext } from '../app-shell-route-context';

export async function redirectFromEarningsRoute(returnPath: string) {
  const routeContext = await loadAppShellRouteContext({
    route: returnPath,
    dashboardErrorLogMessage: 'Dashboard data load failed on earnings page',
    dashboardErrorMessage:
      'Failed to load earnings settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  redirect(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`);
}
