import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { InsightsPanel } from '@/features/dashboard/insights/InsightsPanel';
import { loadAppShellRouteContext } from '../app-shell-route-context';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  // Bare route name; the root layout template supplies the single brand suffix.
  title: 'Insights',
};

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
