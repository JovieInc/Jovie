import * as Sentry from '@sentry/nextjs';
import { cookies } from 'next/headers';
import { ImpersonationBannerWrapper } from '@/components/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/components/admin/OperatorBanner';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';
import type { FeatureFlagsBootstrap } from '@/lib/feature-flags/shared';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState } from '@/lib/queries/server';
import { getDashboardData, setSidebarCollapsed } from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import { ProfileCompletionRedirect } from './ProfileCompletionRedirect';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMPTY_FEATURE_FLAGS_BOOTSTRAP: FeatureFlagsBootstrap = { gates: {} };

export default async function AppShellLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const isE2EClientRuntime = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  // NO MORE AUTH GATE - proxy.ts already routed us correctly!
  // If we're rendering this layout, user is ACTIVE and can access the app.
  try {
    // Get auth first (fast — reads from request headers, cached via React cache()).
    // This lets us start feature flags in parallel with dashboard data,
    // rather than waiting for the entire Promise.all to complete before starting flags.
    const auth = await getCachedAuth();

    // Parallelize dashboard data and feature flags.
    // getDashboardData internally calls getCachedAuth() which is deduplicated.
    // Feature flags now run in parallel instead of waiting for dashboard data.
    const [dashboardData, featureFlagsBootstrap] = await Promise.all([
      getDashboardData(),
      isE2EClientRuntime
        ? Promise.resolve(EMPTY_FEATURE_FLAGS_BOOTSTRAP)
        : getFeatureFlagsBootstrap(auth.userId ?? null),
    ]);

    // Read sidebar cookie server-side so SSR matches client state (no flash)
    const cookieStore = await cookies();
    const sidebarCookie = cookieStore.get('sidebar:state');
    const sidebarDefaultOpen = sidebarCookie?.value !== 'false';

    return (
      <HydrateClient state={getDehydratedState()}>
        {/* ENG-004: Show environment issues to admins in non-production */}
        <OperatorBanner isAdmin={dashboardData.isAdmin} />
        <ImpersonationBannerWrapper />
        <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
          <DashboardDataProvider value={dashboardData}>
            <ProfileCompletionRedirect />
            <AuthShellWrapper
              persistSidebarCollapsed={setSidebarCollapsed}
              sidebarDefaultOpen={sidebarDefaultOpen}
              previewPanelDefaultOpen
            >
              {children}
            </AuthShellWrapper>
          </DashboardDataProvider>
        </FeatureFlagsProvider>
      </HydrateClient>
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    Sentry.captureException(error);

    // SAFETY: Error UI is self-contained - DO NOT render {children} here
    // as it would break context provider expectations (DashboardDataProvider, etc.)
    return (
      <div className='min-h-screen bg-base flex items-center justify-center px-6'>
        <div className='w-full max-w-lg space-y-4'>
          <ErrorBanner
            title='Dashboard failed to load'
            description='We could not load your workspace data. Refresh to try again or return to your profile.'
            actions={[
              { label: 'Retry', href: APP_ROUTES.DASHBOARD },
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
