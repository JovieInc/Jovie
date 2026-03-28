import { cookies } from 'next/headers';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { ImpersonationBannerWrapper } from '@/features/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/features/admin/OperatorBanner';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { HydrateClient } from '@/lib/queries';
import { getDehydratedState } from '@/lib/queries/server';
import { getDashboardData, setSidebarCollapsed } from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import { ProfileCompletionRedirect } from './ProfileCompletionRedirect';

/**
 * Async server component that fetches dashboard data,
 * then wraps children in the required providers.
 *
 * Designed to be rendered inside a Suspense boundary in the shell layout
 * so the browser receives a streaming skeleton immediately while this
 * component resolves data from the database.
 *
 * Feature flags are now code-level (no Statsig), so no async bootstrap needed.
 */
export async function DashboardShellContent({
  children,
}: {
  readonly userId: string;
  readonly children: React.ReactNode;
}) {
  // Full dashboard data fetch — the provider wraps the entire (shell) tree
  // and client components (DashboardTipping, ProfileCompletion, etc.) read
  // tippingStats, hasSocialLinks, hasMusicLinks from context. Using the
  // essential fetch here would return zeros for those fields.
  // The Suspense boundary in the layout streams the skeleton while this resolves.
  const dashboardData = await getDashboardData();

  // Read sidebar cookie server-side so SSR matches client state (no flash)
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get('sidebar:state');
  const sidebarDefaultOpen = sidebarCookie?.value !== 'false';

  return (
    <HydrateClient state={getDehydratedState()}>
      {/* ENG-004: Show environment issues to admins in non-production */}
      <OperatorBanner isAdmin={dashboardData.isAdmin} />
      <ImpersonationBannerWrapper />
      <FeatureFlagsProvider>
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
}
