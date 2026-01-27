import { redirect } from 'next/navigation';
import { DashboardAnalytics } from '@/components/dashboard/dashboard-analytics';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
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
    throwIfRedirect(error);
    console.error('Error loading analytics:', error);

    return (
      <PageErrorState message='Failed to load analytics. Please refresh the page.' />
    );
  }
}
