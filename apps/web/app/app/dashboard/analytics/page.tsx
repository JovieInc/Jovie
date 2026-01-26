import { redirect } from 'next/navigation';
import { DashboardAnalytics } from '@/components/dashboard/dashboard-analytics';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../actions';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/analytics');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Render analytics dashboard
    return <DashboardAnalytics />;
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading analytics:', error);

    return (
      <PageErrorState message='Failed to load analytics. Please refresh the page.' />
    );
  }
}
