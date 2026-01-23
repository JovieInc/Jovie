import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { ImpersonationBannerWrapper } from '@/components/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/components/admin/OperatorBanner';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { resolveUserState } from '@/lib/auth/gate';
import { publicEnv } from '@/lib/env-public';
import { MyStatsig } from '../my-statsig';
import {
  getDashboardDataCached,
  prefetchDashboardData,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';

/**
 * Get user ID for the app shell.
 * NO MORE REDIRECTS - proxy.ts already routed us correctly.
 *
 * If we're here, proxy.ts determined the user is active and can access the app.
 * We just need to get the clerkUserId for downstream use (e.g., Statsig).
 */
async function getAppUserId(): Promise<string> {
  return Sentry.startSpan({ op: 'auth', name: 'app.getUserId' }, async () => {
    const authResult = await resolveUserState();

    // Defensive check: ensure we have a valid Clerk user ID
    if (!authResult.clerkUserId) {
      const error = new Error('Missing clerkUserId despite proxy routing');
      Sentry.captureException(error, {
        tags: { context: 'app_layout_defensive_check' },
        level: 'error',
      });
      console.error('[app-layout] Missing clerkUserId despite proxy routing');
      redirect('/signin?redirect_url=/app/dashboard');
    }

    // proxy.ts already ensured user is ACTIVE, just return userId
    return authResult.clerkUserId;
  });
}

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NO MORE AUTH GATE - proxy.ts already routed us correctly!
  // If we're rendering this layout, user is ACTIVE and can access the app.
  const authPromise = getAppUserId();
  prefetchDashboardData();
  const publishableKey = publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  try {
    // Get user ID for Statsig and dashboard data
    const userId = await authPromise;

    // Get dashboard data - auth gate already validated access, so this is safe
    // No need to double-check onboarding here as resolveUserState() already did it
    // This prevents redirect loops caused by stale cached data
    const dashboardData = await getDashboardDataCached();

    return (
      <ClientProviders publishableKey={publishableKey} skipCoreProviders>
        <MyStatsig userId={userId}>
          {/* ENG-004: Show environment issues to admins in non-production */}
          <OperatorBanner isAdmin={dashboardData.isAdmin} />
          <ImpersonationBannerWrapper />
          <DashboardDataProvider value={dashboardData}>
            <AuthShellWrapper persistSidebarCollapsed={setSidebarCollapsed}>
              {children}
            </AuthShellWrapper>
          </DashboardDataProvider>
        </MyStatsig>
      </ClientProviders>
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading app shell:', error);

    // SAFETY: Error UI is self-contained - DO NOT render {children} here
    // as it would break context provider expectations (DashboardDataProvider, MyStatsig, etc.)
    return (
      <ClientProviders publishableKey={publishableKey} skipCoreProviders>
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
              If this keeps happening, please reach out to support so we can
              help restore access.
            </p>
          </div>
        </div>
      </ClientProviders>
    );
  }
}
