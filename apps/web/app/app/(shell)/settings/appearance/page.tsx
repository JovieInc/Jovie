import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardSettings } from '@/features/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsAppearancePage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/settings/appearance`);
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  return <DashboardSettings focusSection='account' />;
}
