import { redirect } from 'next/navigation';
import { DashboardTippingGate } from '@/components/dashboard/DashboardTippingGate';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
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
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading earnings data:', error);

    return (
      <PageErrorState message='Failed to load earnings data. Please refresh the page.' />
    );
  }
}
