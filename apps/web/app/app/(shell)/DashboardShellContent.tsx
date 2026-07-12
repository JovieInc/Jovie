import * as Sentry from '@sentry/nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { UnavailablePage } from '@/components/UnavailablePage';
import { APP_ROUTES } from '@/constants/routes';
import { ImpersonationBannerWrapper } from '@/features/admin/ImpersonationBannerWrapper';
import { OperatorBannerWrapper } from '@/features/admin/OperatorBannerWrapper';
import { getUserBanStatus } from '@/lib/auth/ban-check';
import { AppFlagProvider } from '@/lib/flags/client';
import { resolveAppShellRouteFlagNames } from '@/lib/flags/route-snapshots';
import { getAppFlagsSnapshot } from '@/lib/flags/server';
import { HydrateClient } from '@/lib/queries';
import { getDehydratedState } from '@/lib/queries/server';
import { DashboardLoadTracker } from './DashboardLoadTracker';
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
 * Runtime app flags are snapshotted server-side for dynamic shell routes so
 * client consumers see the same values on first paint.
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
  // Keep the shell fast on route-owned workspaces. Routes that fetch their own
  // page data should not force the shared shell through the full dashboard path.
  const useEssentialShell = shouldUseEssentialShellData(pathname);
  const cookieStorePromise = cookies();
  const initialFlagsPromise = getAppFlagsSnapshot({
    userId,
    flagNames: resolveAppShellRouteFlagNames(pathname),
  });

  // Timing evidence for the essential vs. full dashboard-data split (JOV
  // one-shell chunk 1.2). Cheap `performance.now()` diff, not a hot-path
  // dependency — safe to leave on permanently.
  const dataFetchStartedAt = performance.now();

  // Run ban check in parallel with dashboard data fetch
  const [dashboardData, banStatus, cookieStore, initialFlags] =
    await Promise.all([
      useEssentialShell ? getDashboardShellData(userId) : getDashboardData(),
      getUserBanStatus(userId),
      cookieStorePromise,
      initialFlagsPromise,
    ]);

  Sentry.logger.debug('[DashboardShellContent] dashboard data fetch', {
    pathname,
    useEssentialShell,
    durationMs: Math.round(performance.now() - dataFetchStartedAt),
  });

  if (banStatus.isBanned) {
    return <UnavailablePage />;
  }

  if (
    shouldRedirectToOnboarding(pathname) &&
    dashboardData.needsOnboarding &&
    !dashboardData.dashboardLoadError
  ) {
    redirect(APP_ROUTES.START);
  }

  // Read sidebar cookie server-side so SSR matches client state (no flash)
  const sidebarCookie = cookieStore.get('sidebar:state');
  const sidebarDefaultOpen = sidebarCookie
    ? sidebarCookie.value !== 'false'
    : !dashboardData.sidebarCollapsed;

  const shellContents = (
    <div className='h-full'>
      {/* ENG-004: Show environment issues to admins in non-production */}
      <OperatorBannerWrapper isAdmin={dashboardData.isAdmin} />
      <ImpersonationBannerWrapper />
      <DashboardDataProvider value={dashboardData}>
        <DashboardLoadTracker pathname={pathname} userId={userId} />
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

  const flaggedShellContents = (
    <AppFlagProvider initialFlags={initialFlags}>
      {shellContents}
    </AppFlagProvider>
  );

  // Always wrap with HydrateClient (even for essential-shell routes with undefined state).
  // This guarantees a stable client component tree root for *all* /app/* routes.
  // Previously the conditional caused <HydrateClient> vs direct <AppFlagProvider>
  // root on warm nav between lightweight and full-data routes, which remounted
  // AuthShellWrapper + AppShellFrame + providers (losing transient sidebar UI state
  // until cookie restore, and risking blank/dark chrome flashes).
  // With a fixed top-level client boundary, AppShellFrame/AuthShell/sidebar/audio
  // chrome now survive all normal client-side navigations inside the shell.
  // Empty state on essential routes is a no-op; pages needing hydration still work.
  const dehydratedState = useEssentialShell ? undefined : getDehydratedState();

  return (
    <HydrateClient state={dehydratedState}>
      {flaggedShellContents}
    </HydrateClient>
  );
}
