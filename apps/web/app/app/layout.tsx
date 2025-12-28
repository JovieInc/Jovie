import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { ImpersonationBannerWrapper } from '@/components/admin/ImpersonationBannerWrapper';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { getCachedAuth } from '@/lib/auth/cached';
import { canAccessApp, resolveUserState, UserState } from '@/lib/auth/gate';
import { MyStatsig } from '../my-statsig';
import {
  getDashboardDataCached,
  prefetchDashboardData,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import DashboardLayoutClient from './dashboard/DashboardLayoutClient';

/**
 * Centralized auth gate for the app shell.
 * Uses resolveUserState() to determine user access and redirect appropriately.
 */
async function ensureAppAccess(): Promise<void> {
  return Sentry.startSpan({ op: 'auth', name: 'app.authGate' }, async () => {
    try {
      const authResult = await resolveUserState();

      // Handle each state with appropriate redirect
      if (!canAccessApp(authResult.state)) {
        // Use redirectTo if available, otherwise apply fallback logic
        if (authResult.redirectTo) {
          redirect(authResult.redirectTo);
        }

        // Fallback redirects for edge cases where redirectTo might be null
        if (authResult.state === UserState.UNAUTHENTICATED) {
          redirect('/signin?redirect_url=/app/dashboard');
        }
        if (
          authResult.state === UserState.NEEDS_WAITLIST_SUBMISSION ||
          authResult.state === UserState.WAITLIST_PENDING
        ) {
          redirect('/waitlist');
        }
        if (authResult.state === UserState.WAITLIST_INVITED) {
          redirect(
            authResult.context.claimToken
              ? `/claim/${encodeURIComponent(authResult.context.claimToken)}`
              : '/waitlist'
          );
        }
        if (
          authResult.state === UserState.NEEDS_ONBOARDING ||
          authResult.state === UserState.NEEDS_DB_USER
        ) {
          redirect('/onboarding');
        }
        if (authResult.state === UserState.BANNED) {
          redirect('/banned');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
        throw error;
      }

      Sentry.captureException(error, {
        tags: { context: 'auth_gate' },
      });
    }
  });
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

  // Use centralized auth gate - handles all auth state checks
  const authPromise = ensureAppAccess();
  prefetchDashboardData();

  try {
    const [dashboardData] = await Promise.all([
      getDashboardDataCached(),
      authPromise,
    ]);

    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    return (
      <MyStatsig userId={userId}>
        <ImpersonationBannerWrapper />
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
