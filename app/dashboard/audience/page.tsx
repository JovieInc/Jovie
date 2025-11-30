import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardAudience } from '@/components/dashboard/DashboardAudience';
import { getDashboardData } from '../actions';

export default async function AudiencePage() {
  const { userId } = await auth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/sign-in?redirect_url=/dashboard/audience');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Pass server-fetched data to client component
    return <DashboardAudience />;
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading audience data:', error);

    // On actual error, show a simple error message
    return (
      <div className='flex items-center justify-center'>
        <div className='w-full max-w-lg rounded-xl border border-subtle bg-surface-1 p-6 text-center shadow-sm'>
          <h1 className='mb-3 text-2xl font-semibold text-primary-token'>
            Something went wrong
          </h1>
          <p className='mb-4 text-secondary-token'>
            Failed to load audience data. Please refresh the page.
          </p>
        </div>
      </div>
    );
  }
}
