import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { MyStatsig } from '@/app/my-statsig';
import { ImpersonationBannerWrapper } from '@/components/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/components/admin/OperatorBanner';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { VersionUpdateBannerWrapper } from '@/components/feedback/VersionUpdateBannerWrapper';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { resolveUserState } from '@/lib/auth/gate';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import {
  getDashboardDataCached,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    // This can happen legitimately in certain scenarios:
    // - Clerk bypass/mock mode is enabled
    // - Session expired between proxy.ts and layout render
    // - Clerk context propagation race condition
    if (!authResult.clerkUserId) {
      const isClerkBypassed =
        publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
        !publicEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

      // Only report to Sentry if this is truly unexpected (not bypass mode)
      if (!isClerkBypassed) {
        Sentry.captureMessage('Missing clerkUserId despite proxy routing', {
          level: 'warning', // Changed from 'error' - this is handled gracefully
          tags: {
            context: 'app_layout_defensive_check',
            vercel_env: env.VERCEL_ENV || 'unknown',
          },
          extra: {
            userState: authResult.state,
            hasDbUser: !!authResult.dbUserId,
          },
        });
      }
      console.warn('[app-layout] Missing clerkUserId, redirecting to signin');
      redirect('/sign-in?redirect_url=/app/dashboard');
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
  try {
    // Parallelize auth and dashboard data fetching for better performance
    // Both share getCachedAuth() via React's cache(), so the auth call is deduplicated
    const [userId, dashboardData] = await Promise.all([
      getAppUserId(),
      getDashboardDataCached(),
    ]);

    return (
      <MyStatsig userId={userId}>
        {/* ENG-004: Show environment issues to admins in non-production */}
        <OperatorBanner isAdmin={dashboardData.isAdmin} />
        <ImpersonationBannerWrapper />
        <VersionUpdateBannerWrapper />
        <DashboardDataProvider value={dashboardData}>
          <AuthShellWrapper persistSidebarCollapsed={setSidebarCollapsed}>
            {children}
          </AuthShellWrapper>
        </DashboardDataProvider>
      </MyStatsig>
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading app shell:', error);

    // SAFETY: Error UI is self-contained - DO NOT render {children} here
    // as it would break context provider expectations (DashboardDataProvider, MyStatsig, etc.)
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
