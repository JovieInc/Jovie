import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardAnalytics } from '@/components/dashboard/DashboardAnalytics';
import { getDashboardData } from '../actions';

export default async function AnalyticsPage() {
  const { userId } = await auth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/dashboard/analytics');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Pass server-fetched data to client component
    return <DashboardAnalytics initialData={dashboardData} />;
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading analytics:', error);

    // On actual error, show a simple error message
    return (
      <div className='text-center'>
        <h1 className='text-2xl font-semibold text-gray-900 dark:text-white mb-4'>
          Something went wrong
        </h1>
        <p className='text-gray-600 dark:text-white/70 mb-4'>
          Failed to load analytics data. Please refresh the page.
        </p>
      </div>
    );
  }
}
