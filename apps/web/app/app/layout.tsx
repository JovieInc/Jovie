import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import { getWaitlistAccessByEmail } from '@/lib/waitlist/access';
import { MyStatsig } from '../my-statsig';
import {
  getDashboardDataCached,
  prefetchDashboardData,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import DashboardLayoutClient from './dashboard/DashboardLayoutClient';

async function ensureWaitlistAccess(): Promise<void> {
  return Sentry.startSpan(
    { op: 'waitlist', name: 'app.waitlistAccess' },
    async () => {
      try {
        const user = await getCachedCurrentUser();
        const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;

        if (!emailRaw) {
          redirect('/waitlist');
        }

        const access = await getWaitlistAccessByEmail(emailRaw);
        if (
          !access.status ||
          access.status === 'new' ||
          access.status === 'rejected'
        ) {
          redirect('/waitlist');
        }

        if (access.status === 'invited') {
          if (access.inviteToken) {
            redirect(`/claim/${encodeURIComponent(access.inviteToken)}`);
          }
          redirect('/waitlist');
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
          throw error;
        }

        Sentry.captureException(error, {
          tags: { context: 'waitlist_gate' },
        });
      }
    }
  );
}

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard');
  }

  const waitlistPromise = ensureWaitlistAccess();
  prefetchDashboardData();

  try {
    const [dashboardData] = await Promise.all([
      getDashboardDataCached(),
      waitlistPromise,
    ]);

    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    return (
      <MyStatsig userId={userId}>
        <DashboardDataProvider value={dashboardData}>
          <DashboardLayoutClient
            dashboardData={dashboardData}
            persistSidebarCollapsed={setSidebarCollapsed}
          >
            {children}
          </DashboardLayoutClient>
        </DashboardDataProvider>
      </MyStatsig>
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading app shell:', error);

    return (
      <div className='min-h-screen bg-base flex items-center justify-center px-6'>
        <div className='w-full max-w-lg space-y-4'>
          <ErrorBanner
            title='Dashboard failed to load'
            description='We could not load your workspace data. Refresh to try again or return to your profile.'
            actions={[
              { label: 'Retry', href: '/app/dashboard' },
              { label: 'Go to my profile', href: '/' },
            ]}
            testId='dashboard-error'
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
