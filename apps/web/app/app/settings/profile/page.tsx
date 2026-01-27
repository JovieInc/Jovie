import { redirect } from 'next/navigation';

import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardDataCached } from '../../dashboard/actions';

export default async function SettingsProfilePage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/profile');
  }

  const dashboardData = await getDashboardDataCached();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  redirect('/app/settings');
}
