import { redirect } from 'next/navigation';
import { DashboardTippingGate } from '@/components/dashboard/DashboardTippingGate';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';

export default async function EarningsPage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/earnings');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Pass server-fetched data to client component behind Statsig gate
    return <DashboardTippingGate />;
  } catch (error) {
    throwIfRedirect(error);
    console.error('Error loading earnings data:', error);

    return (
      <PageErrorState message='Failed to load earnings data. Please refresh the page.' />
    );
  }
}
