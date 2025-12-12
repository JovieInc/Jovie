import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getDashboardDataCached } from '../../dashboard/actions';

export default async function SettingsBillingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/billing');
  }

  const dashboardData = await getDashboardDataCached();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  return <DashboardSettings focusSection='billing' />;
}
