import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardTipping } from '@/components/dashboard/DashboardTipping';
import { getDashboardData } from '../actions';

export default async function TippingPage() {
  const { userId } = await auth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/sign-in?redirect_url=/dashboard/tipping');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Pass server-fetched data to client component
    return <DashboardTipping initialData={dashboardData} />;
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading tipping data:', error);

    // On actual error, show a simple error message
    return (
      <div className='text-center'>
        <h1 className='text-2xl font-semibold text-primary-token mb-4'>
          Something went wrong
        </h1>
        <p className='text-secondary-token mb-4'>
          Failed to load tipping data. Please refresh the page.
        </p>
      </div>
    );
  }
}
