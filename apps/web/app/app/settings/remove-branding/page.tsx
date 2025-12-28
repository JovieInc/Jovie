import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardDataCached } from '../../dashboard/actions';

export default async function SettingsRemoveBrandingPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/settings/remove-branding');
  }

  const dashboardData = await getDashboardDataCached();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return <DashboardSettings focusSection='remove-branding' />;
}
