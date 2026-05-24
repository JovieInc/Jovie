import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsAdminSection } from '@/features/dashboard/organisms/SettingsAdminSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { loadAppShellRouteContext } from '../../app-shell-route-context';

export const runtime = 'nodejs';

export default async function SettingsAdminPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_ADMIN,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings admin page',
    dashboardErrorMessage:
      'Failed to load admin settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  if (!routeContext.dashboardData.isAdmin) {
    redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
  }

  return (
    <SettingsSection
      id='admin'
      title='Admin'
      description='Persistent admin defaults, environment controls, and quick links into the operator workspaces.'
    >
      <SettingsAdminSection />
    </SettingsSection>
  );
}
