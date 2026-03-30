import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardTippingGate } from '@/features/dashboard/DashboardTippingGate';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { HydrateClient, queryKeys } from '@/lib/queries';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardShellData } from '../actions';
import EarningsLoading from './loading';

export const runtime = 'nodejs';

/**
 * Earnings page — streams instantly after auth gate.
 *
 * Auth check via getCachedAuth (Clerk JWT, no DB) runs at the page level
 * so unauthenticated users redirect immediately. Uses getDashboardShellData
 * (skips settings/entitlements) for faster shell rendering. Data loads
 * inside a Suspense boundary so the skeleton shows instantly.
 */
export default async function EarningsPage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users — redirect before Suspense
  if (!userId) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_EARNINGS}`
    );
  }

  return (
    <Suspense fallback={<EarningsLoading />}>
      <EarningsContent userId={userId} />
    </Suspense>
  );
}

/**
 * Async server component — fetches dashboard shell + earnings data.
 * Suspense boundary above shows skeleton instantly while this resolves.
 */
async function EarningsContent({
  userId,
}: Readonly<{
  userId: string;
}>) {
  try {
    // Shell data is faster than full data (skips settings/entitlements)
    const dashboardData = await getDashboardShellData(userId);

    // If data load failed, show error state (don't redirect — user IS authenticated)
    if (dashboardData.dashboardLoadError) {
      void captureError(
        'Dashboard data load failed on earnings page',
        dashboardData.dashboardLoadError,
        { route: APP_ROUTES.DASHBOARD_EARNINGS }
      );
      return (
        <PageErrorState message='Failed to load earnings data. Please refresh the page.' />
      );
    }

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
      redirect(APP_ROUTES.ONBOARDING);
    }

    // Prefetch earnings into TanStack Query for SPA navigation cache
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.earnings.stats(),
      queryFn: async () => {
        // Earnings data is fetched client-side via API — seed with dashboard tipping stats
        return {
          stats: {
            totalRevenueCents: dashboardData.tippingStats.totalReceivedCents,
            totalTips: dashboardData.tippingStats.tipsSubmitted,
            averageTipCents:
              dashboardData.tippingStats.tipsSubmitted > 0
                ? Math.round(
                    dashboardData.tippingStats.totalReceivedCents /
                      dashboardData.tippingStats.tipsSubmitted
                  )
                : 0,
          },
          tippers: [],
        };
      },
    });

    // Pass server-fetched data to client component behind Statsig gate
    return (
      <HydrateClient state={getDehydratedState()}>
        <DashboardTippingGate />
      </HydrateClient>
    );
  } catch (error) {
    throwIfRedirect(error);
    void captureError('Earnings page failed', error, {
      route: APP_ROUTES.DASHBOARD_EARNINGS,
    });

    return (
      <PageErrorState message='Failed to load earnings data. Please refresh the page.' />
    );
  }
}
