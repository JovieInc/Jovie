import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { loadAppShellRouteContext } from '../../app-shell-route-context';
import { ConnectorsClient } from './ConnectorsClient';
import { loadSettingsConnectorsData } from './connectors-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connectors',
};

export default async function SettingsConnectorsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_CONNECTORS,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings connectors page',
    dashboardErrorMessage:
      'Failed to load connector settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const connectorsData = await loadSettingsConnectorsData(routeContext.userId);
  if (!connectorsData) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return (
    <ConnectorsClient
      gmail={connectorsData.gmail}
      calendar={connectorsData.calendar}
      suggestedActions={connectorsData.suggestedActions}
      isDev={process.env.NODE_ENV !== 'production'}
    />
  );
}
