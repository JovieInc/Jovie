import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { loadAppShellRouteContext } from '../../app-shell-route-context';

export const runtime = 'nodejs';

export default async function SettingsAdminPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_ADMIN,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings admin redirect',
    dashboardErrorMessage:
      'Failed to load admin settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  if (!routeContext.dashboardData.isAdmin) {
    redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
  }

  redirect(APP_ROUTES.ADMIN_OPS);
}
