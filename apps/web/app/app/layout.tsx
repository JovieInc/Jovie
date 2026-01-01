import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { ImpersonationBannerWrapper } from '@/components/admin/ImpersonationBannerWrapper';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { canAccessApp, resolveUserState } from '@/lib/auth/gate';
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
 *
 * Returns the clerkUserId for downstream use (e.g., Statsig).
 */
async function ensureAppAccess(): Promise<string> {
  return Sentry.startSpan({ op: 'auth', name: 'app.authGate' }, async () => {
    const authResult = await resolveUserState();

    // Handle each state with appropriate redirect
    if (!canAccessApp(authResult.state)) {
      // resolveUserState always provides redirectTo for non-ACTIVE states
      if (authResult.redirectTo) {
        redirect(authResult.redirectTo);
      }
      // Fallback (should never reach here)
      redirect('/signin?redirect_url=/app/dashboard');
    }

    // Return clerkUserId for downstream use
    return authResult.clerkUserId!;
  });
}

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use centralized auth gate - handles all auth state checks including:
  // - UNAUTHENTICATED → /signin
  // - NEEDS_WAITLIST_SUBMISSION/WAITLIST_PENDING → /waitlist
  // - WAITLIST_INVITED → /claim/[token]
  // - NEEDS_ONBOARDING/NEEDS_DB_USER → /onboarding
  // - BANNED → /banned
  const authPromise = ensureAppAccess();
  prefetchDashboardData();

  try {
    const [dashboardData, userId] = await Promise.all([
      getDashboardDataCached(),
      authPromise,
    ]);

    // Double-check onboarding status from dashboard data
    // This catches edge cases where profile was created but onboarding not completed
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
