import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { UnavailablePage } from '@/components/UnavailablePage';
import { APP_ROUTES } from '@/constants/routes';
import { ImpersonationBannerWrapper } from '@/features/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/features/admin/OperatorBanner';
import { getUserBanStatus } from '@/lib/auth/ban-check';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS, type AppFlagSnapshot } from '@/lib/flags/contracts';
import { getAppFlagsSnapshot, getAppFlagValue } from '@/lib/flags/server';
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

async function getEssentialShellFlagsSnapshot(
  userId: string
): Promise<AppFlagSnapshot> {
  const designV1 = await getAppFlagValue('DESIGN_V1', { userId });

  return {
    ...APP_FLAG_DEFAULTS,
    DESIGN_V1: designV1,
    SHELL_CHAT_V1: designV1,
    DESIGN_V1_RELEASES: designV1,
    DESIGN_V1_TASKS: designV1,
    DESIGN_V1_CHAT_ENTITIES: designV1,
    DESIGN_V1_LYRICS: designV1,
    DESIGN_V1_LIBRARY: designV1,
    DESIGN_V1_AUTH: designV1,
    DESIGN_V1_ONBOARDING: designV1,
  };
}

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
  // Keep the shell fast on the chat-first landing path and releases.
  // Other dashboard/settings routes still receive the full dashboard context
  // because they rely on supplementary fields from the slower fetch.
  const useEssentialShell = shouldUseEssentialShellData(pathname);
  const cookieStorePromise = cookies();
  const initialFlagsPromise = useEssentialShell
    ? getEssentialShellFlagsSnapshot(userId)
    : getAppFlagsSnapshot({ userId });

  // Run ban check in parallel with dashboard data fetch
  const [dashboardData, banStatus, cookieStore, initialFlags] =
    await Promise.all([
      useEssentialShell ? getDashboardShellData(userId) : getDashboardData(),
      getUserBanStatus(userId),
      cookieStorePromise,
      initialFlagsPromise,
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

  const flaggedShellContents = (
    <AppFlagProvider initialFlags={initialFlags}>
      {shellContents}
    </AppFlagProvider>
  );

  if (useEssentialShell) {
    return flaggedShellContents;
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      {flaggedShellContents}
    </HydrateClient>
  );
}
