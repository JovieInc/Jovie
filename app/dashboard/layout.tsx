import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDashboardData, setSidebarCollapsed } from './actions';
import DashboardLayoutClient from './DashboardLayoutClient';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/dashboard');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    return (
      <DashboardLayoutClient
        dashboardData={dashboardData}
        persistSidebarCollapsed={setSidebarCollapsed}
      >
        {children}
      </DashboardLayoutClient>
    );
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading dashboard:', error);

    // On actual error, show a simple error page
    return (
      <div className='min-h-screen bg-base flex items-center justify-center'>
        <div className='text-center'>
          <h1 className='text-2xl font-semibold text-primary-token mb-4'>
            Something went wrong
          </h1>
          <p className='text-secondary-token mb-4'>
            Failed to load dashboard data. Please refresh the page.
          </p>
          <Link href='/dashboard' className='btn btn-primary btn-md'>
            Refresh Page
          </Link>
        </div>
      </div>
    );
  }
}
