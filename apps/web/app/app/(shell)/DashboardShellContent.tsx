import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { UnavailablePage } from '@/components/UnavailablePage';
import { APP_ROUTES } from '@/constants/routes';
import { ImpersonationBannerWrapper } from '@/features/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/features/admin/OperatorBanner';
import { getUserBanStatus } from '@/lib/auth/ban-check';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { HydrateClient } from '@/lib/queries';
import { getDehydratedState } from '@/lib/queries/server';
import {
  getDashboardData,
  getDashboardShellData,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import { ProfileCompletionRedirect } from './ProfileCompletionRedirect';
import {
  shouldRedirectToOnboarding,
  shouldUseEssentialShellData,
} from './shell-route-matches';

/**
 * Async server component that fetches dashboard data,
 * then wraps children in the required providers.
 *
 * Designed to be rendered inside a Suspense boundary in the shell layout
 * so the browser receives a streaming skeleton immediately while this
 * component resolves data from the database.
 *
 * Ban check runs in parallel with the dashboard data fetch — banned users
 * are rare enough that blocking every page load for them isn't worth it.
 *
 * Feature flags are now code-level (no Statsig), so no async bootstrap needed.
 */
export async function DashboardShellContent({
  userId,
  pathname,
  children,
}: {
  readonly userId: string;
  readonly pathname: string | null;
  readonly children: React.ReactNode;
}) {
  // Keep the shell fast on the chat-first landing path and releases.
  // Other dashboard/settings routes still receive the full dashboard context
  // because they rely on supplementary fields from the slower fetch.
  const useEssentialShell = shouldUseEssentialShellData(pathname);
  const cookieStorePromise = cookies();

  // Run ban check in parallel with dashboard data fetch.
  // For releases route: also start the release matrix prefetch in parallel
  // so it overlaps with the shell data fetch instead of running after it.
  const isReleasesRoute = pathname === APP_ROUTES.DASHBOARD_RELEASES;
  const shellDataPromise = useEssentialShell
    ? getDashboardShellData(userId)
    : getDashboardData();

  // Fire-and-forget: start release matrix prefetch as soon as shell data
  // resolves, while ban check and cookie read continue in parallel.
  if (isReleasesRoute) {
    void shellDataPromise.then(async data => {
      const profileId = data.selectedProfile?.id;
      if (profileId) {
        const { getQueryClient } = await import('@/lib/queries/server');
        const { queryKeys } = await import('@/lib/queries');
        const { loadReleaseMatrix } = await import(
          './dashboard/releases/actions'
        );
        const queryClient = getQueryClient();
        void queryClient.prefetchQuery({
          queryKey: queryKeys.releases.matrix(profileId),
          queryFn: () => loadReleaseMatrix(profileId),
        });
      }
    });
  }

  const [dashboardData, banStatus, cookieStore] = await Promise.all([
    shellDataPromise,
    getUserBanStatus(userId),
    cookieStorePromise,
  ]);

  if (banStatus.isBanned) {
    return <UnavailablePage />;
  }

  if (
    shouldRedirectToOnboarding(pathname) &&
    dashboardData.needsOnboarding &&
    !dashboardData.dashboardLoadError
  ) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  // Read sidebar cookie server-side so SSR matches client state (no flash)
  const sidebarCookie = cookieStore.get('sidebar:state');
  const sidebarDefaultOpen = sidebarCookie?.value !== 'false';

  const shellContents = (
    <div className='animate-shell-in h-full'>
      {/* ENG-004: Show environment issues to admins in non-production */}
      <OperatorBanner isAdmin={dashboardData.isAdmin} />
      <ImpersonationBannerWrapper />
      <DashboardDataProvider value={dashboardData}>
        <ProfileCompletionRedirect />
        <AuthShellWrapper
          persistSidebarCollapsed={setSidebarCollapsed}
          sidebarDefaultOpen={sidebarDefaultOpen}
          previewPanelDefaultOpen={!useEssentialShell}
        >
          {children}
        </AuthShellWrapper>
      </DashboardDataProvider>
    </div>
  );

  if (useEssentialShell) {
    return shellContents;
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <FeatureFlagsProvider>{shellContents}</FeatureFlagsProvider>
    </HydrateClient>
  );
}
