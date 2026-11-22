import type { Metadata } from 'next';
import { DashboardsTable } from '@/components/features/views/DashboardsTable';
import { APP_ROUTES } from '@/constants/routes';
import { listDashboardsForOwner } from '@/lib/views/service.server';
import { loadAppShellRouteContext } from '../app-shell-route-context';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Dashboards',
};

export default async function DashboardsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.DASHBOARDS,
    dashboardErrorLogMessage: 'Dashboard data load failed on dashboards page',
    dashboardErrorMessage:
      'Failed to load dashboards. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const dashboards = await listDashboardsForOwner(routeContext.userId);
  const rows = dashboards.map(view => ({
    id: view.id,
    title: view.title,
    token: view.token,
    source: view.source,
    updatedAt: view.updatedAt.toISOString(),
  }));

  return (
    <div className='mx-auto w-full max-w-5xl space-y-4 px-4 py-6'>
      <h1 className='text-lg font-medium text-primary-token'>Dashboards</h1>
      <DashboardsTable rows={rows} />
    </div>
  );
}
