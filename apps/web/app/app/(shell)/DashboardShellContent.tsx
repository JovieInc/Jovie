import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { APP_ROUTES } from '@/constants/routes';
import { ImpersonationBannerWrapper } from '@/features/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/features/admin/OperatorBanner';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { HydrateClient } from '@/lib/queries';
import { getDehydratedState } from '@/lib/queries/server';
import {
  getDashboardData,
  getDashboardDataEssential,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import { ProfileCompletionRedirect } from './ProfileCompletionRedirect';

function resolveRequestPath(nextUrlHeader: string | null): string | null {
  if (!nextUrlHeader) {
    return null;
  }

  try {
    return new URL(nextUrlHeader, 'https://jovie.local').pathname;
  } catch {
    return null;
  }
}

function shouldUseEssentialShellData(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return (
    pathname === APP_ROUTES.DASHBOARD ||
    pathname === APP_ROUTES.DASHBOARD_RELEASES ||
    pathname === APP_ROUTES.CHAT ||
    pathname.startsWith(`${APP_ROUTES.CHAT}/`)
  );
}

function shouldRedirectToOnboarding(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return (
    pathname === APP_ROUTES.DASHBOARD ||
    pathname === APP_ROUTES.DASHBOARD_RELEASES ||
    pathname === APP_ROUTES.CHAT ||
    pathname.startsWith(`${APP_ROUTES.CHAT}/`)
  );
}

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
  readonly children: React.ReactNode;
}) {
  // Keep the shell fast on the chat-first landing path and releases.
  // Other dashboard/settings routes still receive the full dashboard context
  // because they rely on supplementary fields from the slower fetch.
  const headerStore = await headers();
  const pathname = resolveRequestPath(headerStore.get('next-url'));
  const dashboardData = shouldUseEssentialShellData(pathname)
    ? await getDashboardDataEssential()
    : await getDashboardData();

  if (
    shouldRedirectToOnboarding(pathname) &&
    dashboardData.needsOnboarding &&
    !dashboardData.dashboardLoadError
  ) {
    redirect(APP_ROUTES.ONBOARDING);
  }

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
