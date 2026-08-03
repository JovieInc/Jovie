import { PageErrorState } from '@/components/features/feedback/PageErrorState';
import { APP_ROUTES } from '@/constants/routes';
import { isDevelopment } from '@/lib/utils/platform-detection/environment';
import { loadAppShellRouteContext } from '../../app-shell-route-context';
import { ConnectorsClient } from './ConnectorsClient';
import { loadSettingsConnectorsData } from './connectors-data';

export const runtime = 'nodejs';

export default async function SettingsConnectionsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_CONNECTORS,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings connections page',
    dashboardErrorMessage:
      'Failed to load connections settings. Please refresh the page.',
  });
  if (!routeContext.ok) return routeContext.error;

  const data = await loadSettingsConnectorsData(routeContext.userId);
  if (!data) {
    return (
      <PageErrorState message='Unable to load your account connections. Please refresh the page.' />
    );
  }

  return <ConnectorsClient {...data} isDev={isDevelopment()} />;
}
