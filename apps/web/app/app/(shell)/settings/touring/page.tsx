import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsTouringPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/touring');
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return <DashboardSettings focusSection='touring' />;
}
