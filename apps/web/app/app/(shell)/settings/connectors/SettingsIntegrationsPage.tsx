import { PageErrorState } from '@/components/features/feedback/PageErrorState';
import { APP_ROUTES } from '@/constants/routes';
import { isDevelopment } from '@/lib/utils/platform-detection/environment';
import { loadAppShellRouteContext } from '../../app-shell-route-context';
import { ConnectorsClient } from './ConnectorsClient';
import { loadSettingsConnectorsData } from './connectors-data';

export async function SettingsIntegrationsPage({
  route = APP_ROUTES.SETTINGS_CONNECTORS,
}: {
  readonly route?: string;
}) {
  const routeContext = await loadAppShellRouteContext({
    route,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings connections page',
    dashboardErrorMessage:
      'Failed to load connections settings. Please refresh the page.',
  });
  if (!routeContext.ok) return routeContext.error;

  const data = await loadSettingsConnectorsData(
    routeContext.userId,
    routeContext.profileId
  );
  if (!data) {
    return (
      <PageErrorState message='Unable to load your account connections. Please refresh the page.' />
    );
  }

  return (
    <ConnectorsClient
      {...data}
      returnTo={route}
      creatorProfileId={routeContext.profileId}
      isDev={isDevelopment()}
    />
  );
}
