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

    // Handle database errors (don't redirect to onboarding)
    if (dashboardData.error) {
      return (
        <div className='min-h-screen bg-white dark:bg-[#0D0E12] flex items-center justify-center p-4'>
          <div className='max-w-md text-center'>
            <div className='mb-4 text-red-500 dark:text-red-400'>
              <svg
                className='mx-auto h-12 w-12'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                />
              </svg>
            </div>
            <h1 className='text-2xl font-semibold text-gray-900 dark:text-white mb-2'>
              Dashboard Temporarily Unavailable
            </h1>
            <p className='text-gray-600 dark:text-white/70 mb-6'>
              {dashboardData.error.message}
            </p>
            {dashboardData.error.retryable && (
              <Link
                href='/dashboard'
                className='inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors'
              >
                Try Again
              </Link>
            )}
          </div>
        </div>
      );
    }

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
      <div className='min-h-screen bg-white dark:bg-[#0D0E12] flex items-center justify-center p-4'>
        <div className='max-w-md text-center'>
          <h1 className='text-2xl font-semibold text-gray-900 dark:text-white mb-4'>
            Something went wrong
          </h1>
          <p className='text-gray-600 dark:text-white/70 mb-4'>
            An unexpected error occurred. Please try again.
          </p>
          <Link
            href='/dashboard'
            className='inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors'
          >
            Refresh Page
          </Link>
        </div>
      </div>
    );
  }
}
