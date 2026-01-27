import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardDataCached } from '../../dashboard/actions';

// Revalidate every minute for settings data
export const revalidate = 60;

export default async function SettingsBillingPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/billing');
  }

  const dashboardData = await getDashboardDataCached();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return <DashboardSettings focusSection='billing' />;
}
