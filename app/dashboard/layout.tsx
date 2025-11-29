import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { MyStatsig } from '../my-statsig';
import { getDashboardDataCached, setSidebarCollapsed } from './actions';
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
    const dashboardData = await getDashboardDataCached();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    return (
      <MyStatsig userId={userId}>
        <DashboardLayoutClient
          dashboardData={dashboardData}
          persistSidebarCollapsed={setSidebarCollapsed}
        >
          {children}
        </DashboardLayoutClient>
      </MyStatsig>
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
      <div className='min-h-screen bg-white dark:bg-[#0D0E12] flex items-center justify-center px-6'>
        <div className='w-full max-w-lg space-y-4'>
          <ErrorBanner
            title='Dashboard failed to load'
            description='We could not load your workspace data. Refresh to try again or return to your profile.'
            actions={[
              { label: 'Retry', href: '/dashboard' },
              { label: 'Go to my profile', href: '/' },
            ]}
            testId='dashboard-error'
          />
          <p className='text-sm text-gray-600 dark:text-white/70 text-center'>
            If this keeps happening, please reach out to support so we can help
            restore access.
          </p>
          <div className='flex justify-center'>
            <Link
              href='/'
              className='inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-900 dark:bg-white dark:text-black'
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
