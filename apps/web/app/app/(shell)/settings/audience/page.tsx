import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsAudiencePage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/settings/audience`);
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  return <DashboardSettings focusSection='audience-tracking' />;
}
