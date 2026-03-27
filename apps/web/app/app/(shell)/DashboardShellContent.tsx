import { cookies } from 'next/headers';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';
import { ImpersonationBannerWrapper } from '@/features/admin/ImpersonationBannerWrapper';
import { OperatorBanner } from '@/features/admin/OperatorBanner';
import { FeatureFlagsProvider } from '@/lib/feature-flags/client';
import { getFeatureFlagsBootstrap } from '@/lib/feature-flags/server';
import type { FeatureFlagsBootstrap } from '@/lib/feature-flags/shared';
import { HydrateClient } from '@/lib/queries';
import { getDehydratedState } from '@/lib/queries/server';
import {
  getDashboardDataEssential,
  setSidebarCollapsed,
} from './dashboard/actions';
import { DashboardDataProvider } from './dashboard/DashboardDataContext';
import { ProfileCompletionRedirect } from './ProfileCompletionRedirect';

const EMPTY_FEATURE_FLAGS_BOOTSTRAP: FeatureFlagsBootstrap = { gates: {} };

/**
 * Async server component that fetches dashboard data and feature flags,
 * then wraps children in the required providers.
 *
 * Designed to be rendered inside a Suspense boundary in the shell layout
 * so the browser receives a streaming skeleton immediately while this
 * component resolves data from the database and feature flag service.
 */
export async function DashboardShellContent({
  userId,
  children,
}: {
  readonly userId: string;
  readonly children: React.ReactNode;
}) {
  const isE2EClientRuntime = process.env.NEXT_PUBLIC_E2E_MODE === '1';

  // Use the essential (fast-path) fetch: only user + profiles + settings.
  // Skips tipping stats, social links, and avatar quality (~3 queries
  // instead of ~6). Those fields get safe defaults — pages that need
  // them call getDashboardData() themselves.
  const [dashboardData, featureFlagsBootstrap] = await Promise.all([
    getDashboardDataEssential(),
    isE2EClientRuntime
      ? Promise.resolve(EMPTY_FEATURE_FLAGS_BOOTSTRAP)
      : getFeatureFlagsBootstrap(userId),
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
}
