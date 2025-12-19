import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardDataCached } from '../../dashboard/actions';

export default async function SettingsProfilePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/settings/profile');
  }

  const dashboardData = await getDashboardDataCached();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  redirect('/app/settings/account');
}
