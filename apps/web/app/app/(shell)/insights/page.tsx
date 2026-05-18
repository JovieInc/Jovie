import { APP_ROUTES } from '@/constants/routes';
import { InsightsPanel } from '@/features/dashboard/insights/InsightsPanel';
import { loadAppShellRouteContext } from '../app-shell-route-context';

export const runtime = 'nodejs';

export default async function InsightsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.INSIGHTS,
    dashboardErrorLogMessage: 'Dashboard data load failed on insights page',
    dashboardErrorMessage: 'Failed to load insights. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  return <InsightsPanel />;
}
