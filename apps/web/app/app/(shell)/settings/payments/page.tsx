import { APP_ROUTES } from '@/constants/routes';
import { SettingsPaymentsSection } from '@/features/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { loadAppShellRouteContext } from '../../app-shell-route-context';

export const runtime = 'nodejs';

export default async function SettingsPaymentsPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.SETTINGS_PAYMENTS,
    dashboardErrorLogMessage:
      'Dashboard data load failed on settings payments page',
    dashboardErrorMessage:
      'Failed to load payment settings. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  return (
    <SettingsSection id='payments' title='Payments'>
      <SettingsPaymentsSection />
    </SettingsSection>
  );
}
