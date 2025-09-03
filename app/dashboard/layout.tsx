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
      <div className='min-h-screen bg-white dark:bg-[#0D0E12] flex items-center justify-center'>
        <div className='text-center'>
          <h1 className='text-2xl font-semibold text-gray-900 dark:text-white mb-4'>
            Something went wrong
          </h1>
          <p className='text-gray-600 dark:text-white/70 mb-4'>
            Failed to load dashboard data. Please refresh the page.
          </p>
          <Link
            href='/dashboard'
            className='inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700'
          >
            Refresh Page
          </Link>
        </div>
      </div>
    );
  }
}
