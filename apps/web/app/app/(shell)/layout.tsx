import { ImpersonationBannerWrapper } from '@/components/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/components/admin/OperatorBanner';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { VersionUpdateToastActivator } from '@/components/feedback/VersionUpdateToastActivator';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';
import { getDashboardData, setSidebarCollapsed } from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AppShellLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  // NO MORE AUTH GATE - proxy.ts already routed us correctly!
  // If we're rendering this layout, user is ACTIVE and can access the app.
  try {
    // Parallelize auth and dashboard data fetching for better performance
    // Both share getCachedAuth() via React's cache(), so the auth call is deduplicated
    const [dashboardData, auth] = await Promise.all([
      getDashboardData(),
      getCachedAuth(),
    ]);

    // Evaluate feature flags server-side for this user
    const featureFlagsBootstrap = await getFeatureFlagsBootstrap(
      auth.userId ?? null
    );

    return (
      <>
        {/* ENG-004: Show environment issues to admins in non-production */}
        <OperatorBanner isAdmin={dashboardData.isAdmin} />
        <ImpersonationBannerWrapper />
        <VersionUpdateToastActivator />
        <FeatureFlagsProvider bootstrap={featureFlagsBootstrap}>
          <DashboardDataProvider value={dashboardData}>
            <AuthShellWrapper persistSidebarCollapsed={setSidebarCollapsed}>
              {children}
            </AuthShellWrapper>
          </DashboardDataProvider>
        </FeatureFlagsProvider>
      </>
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading app shell:', error);

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
