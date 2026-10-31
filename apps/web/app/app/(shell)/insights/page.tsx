import { APP_ROUTES } from '@/constants/routes';
import { InsightsPanel } from '@/features/dashboard/insights/InsightsPanel';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { AudienceWorkspaceTabs } from '../contacts/AudienceWorkspaceTabs';

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

  // Insights is the Audience root's third destination: keep its sub-nav.
  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
      <AudienceWorkspaceTabs activeTab='insights' />
      <InsightsPanel />
    </div>
  );
}
