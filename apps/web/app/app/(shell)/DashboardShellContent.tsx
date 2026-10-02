import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UnavailablePage } from '@/components/UnavailablePage';
import { APP_ROUTES } from '@/constants/routes';
import { ImpersonationBannerWrapper } from '@/features/admin/ImpersonationBannerWrapper';
import { OperatorBannerWrapper } from '@/features/admin/OperatorBannerWrapper';
import { shouldRenderOperatorChrome } from '@/lib/app-shell/workspaces';
import { getUserBanStatus } from '@/lib/auth/ban-check';
import { getFreshAuth } from '@/lib/auth/cached';
import { AppFlagProvider } from '@/lib/flags/client';
import { resolveAppShellRouteFlagNames } from '@/lib/flags/route-snapshots';
import { getAppFlagsSnapshot } from '@/lib/flags/server';
import { getOviePrivacyLockState } from '@/lib/ovie/privacy-lock/server';
import { HydrateClient } from '@/lib/queries';
import { getDehydratedState } from '@/lib/queries/server';
import { MoneyVisibilityProvider } from '@/lib/workspace-lock/money-visibility';
import {
  isMoneyHiddenCookieValue,
  MONEY_HIDDEN_COOKIE,
} from '@/lib/workspace-lock/workspace-lock';
import type { AppShellMode } from '@/types/app-shell';
import { DashboardLoadTracker } from './DashboardLoadTracker';
import { DashboardShellPrivacyBoundary } from './DashboardShellPrivacyBoundary';
import {
  getDashboardData,
  getDashboardShellData,
  setSidebarCollapsed,
} from './dashboard/actions';
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
  mode,
  children,
}: {
  readonly userId: string;
  readonly pathname: string | null;
  readonly mode: AppShellMode;
  readonly children: React.ReactNode;
}) {
  // Keep the shell fast on route-owned workspaces. Routes that fetch their own
  // page data should not force the shared shell through the full dashboard path.
  const useEssentialShell = shouldUseEssentialShellData(pathname);
  const cookieStorePromise = cookies();

  // Run ban check in parallel with dashboard data fetch
  const [banStatus, cookieStore] = await Promise.all([
    getUserBanStatus(userId),
    cookieStorePromise,
  ]);

  if (banStatus.isBanned) {
    return <UnavailablePage />;
  }

  // Ovie role access has already been checked by the shell layout. Read its
  // opt-in privacy state before any dashboard DAL call; Jovie never queries it.
  let initiallyLocked = false;
  let privacyEnabled = false;
  let lockedUntil: string | null = null;
  if (mode === 'ov') {
    try {
      const auth = await getFreshAuth();
      if (!auth.userId || !auth.sessionId) {
        initiallyLocked = true;
      } else {
        const privacy = await getOviePrivacyLockState({
          userId: auth.userId,
          sessionId: auth.sessionId,
        });
        privacyEnabled = privacy.enabled;
        initiallyLocked = privacy.enabled && privacy.locked;
        lockedUntil = privacy.unlockedUntil;
        if (privacy.enabled && !lockedUntil) initiallyLocked = true;
      }
    } catch {
      initiallyLocked = true;
    }
  }
  const [dashboardData, initialFlags] = initiallyLocked
    ? [null, {}]
    : await Promise.all([
        useEssentialShell ? getDashboardShellData(userId) : getDashboardData(),
        getAppFlagsSnapshot({
          userId,
          flagNames: resolveAppShellRouteFlagNames(pathname),
        }),
      ]);
  const showOperatorChrome = shouldRenderOperatorChrome(mode, {
    isAdmin: mode === 'ov' || Boolean(dashboardData?.isAdmin),
  });
  const moneyHidden = isMoneyHiddenCookieValue(
    cookieStore.get(MONEY_HIDDEN_COOKIE)?.value
  );

  if (
    shouldRedirectToOnboarding(pathname) &&
    dashboardData?.needsOnboarding &&
    !dashboardData.dashboardLoadError
  ) {
    redirect(APP_ROUTES.START);
  }

  // Read sidebar cookie server-side so SSR matches client state (no flash)
  const sidebarCookie = cookieStore.get('sidebar:state');
  const sidebarDefaultOpen = sidebarCookie
    ? sidebarCookie.value !== 'false'
    : !dashboardData?.sidebarCollapsed;
  // Keep the client shell stable across route changes, but remount its
  // stateful privacy boundary when server authorization state changes.
  const privacyBoundaryKey = JSON.stringify([
    mode,
    userId,
    privacyEnabled,
    initiallyLocked,
    lockedUntil,
  ]);

  const shellContents = (
    <div className='h-full'>
      <DashboardShellPrivacyBoundary
        key={privacyBoundaryKey}
        mode={mode}
        userId={userId}
        dashboardData={dashboardData}
        initiallyLocked={initiallyLocked}
        privacyEnabled={privacyEnabled}
        lockedUntil={lockedUntil}
        persistSidebarCollapsed={setSidebarCollapsed}
        sidebarDefaultOpen={sidebarDefaultOpen}
        previewPanelDefaultOpen={!useEssentialShell}
        unlockedShellChrome={
          initiallyLocked ? null : (
            <>
              {/* ENG-004: Show environment issues to admins in Ovie, non-production */}
              <OperatorBannerWrapper isAdmin={showOperatorChrome} />
              <ImpersonationBannerWrapper />
              <DashboardLoadTracker pathname={pathname} userId={userId} />
              <ProfileCompletionRedirect />
            </>
          )
        }
      >
        {initiallyLocked ? null : children}
      </DashboardShellPrivacyBoundary>
    </div>
  );

  const flaggedShellContents = (
    <AppFlagProvider initialFlags={initialFlags}>
      <MoneyVisibilityProvider hidden={moneyHidden}>
        {shellContents}
      </MoneyVisibilityProvider>
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
  const dehydratedState =
    initiallyLocked || useEssentialShell ? undefined : getDehydratedState();

  return (
    <HydrateClient state={dehydratedState}>
      {flaggedShellContents}
    </HydrateClient>
  );
}
