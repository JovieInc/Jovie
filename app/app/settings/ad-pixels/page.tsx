import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getDashboardDataCached } from '../../dashboard/actions';

export default async function SettingsAdPixelsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/settings/ad-pixels');
  }

  const dashboardData = await getDashboardDataCached();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return <DashboardSettings focusSection='ad-pixels' />;
}
