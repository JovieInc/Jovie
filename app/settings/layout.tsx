import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import {
  getDashboardDataCached,
  setSidebarCollapsed,
} from '../dashboard/actions';
import DashboardLayoutClient from '../dashboard/DashboardLayoutClient';
import { MyStatsig } from '../my-statsig';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/settings');
  }

  try {
    const dashboardData = await getDashboardDataCached();

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
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading settings:', error);

    return (
      <div className='min-h-screen bg-base flex items-center justify-center px-6'>
        <div className='w-full max-w-lg space-y-4'>
          <ErrorBanner
            title='Settings failed to load'
            description='We could not load your workspace data. Refresh to try again or return to your profile.'
            actions={[
              { label: 'Retry', href: '/settings' },
              { label: 'Go to my profile', href: '/' },
            ]}
            testId='settings-error'
          />
          <p className='text-sm text-secondary-token text-center'>
            If this keeps happening, please reach out to support so we can help
            restore access.
          </p>
        </div>
      </div>
    );
  }
}
