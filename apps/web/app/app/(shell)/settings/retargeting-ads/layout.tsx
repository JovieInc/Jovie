import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { loadAppShellRouteContext } from '@/app/app/(shell)/app-shell-route-context';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const dynamic = 'force-dynamic';

export default async function RetargetingAdsLayout({
  children,
}: {
  children: ReactNode;
}) {
  // getCurrentUserEntitlements degrades gracefully on billing failure --
  // admin status is fetched independently and preserved even when billing is down.
  const [routeContext, entitlements] = await Promise.all([
    loadAppShellRouteContext({
      route: APP_ROUTES.SETTINGS_RETARGETING_ADS,
      dashboardErrorLogMessage:
        'Dashboard data load failed on retargeting ads settings page',
      dashboardErrorMessage:
        'Failed to load retargeting ads settings. Please refresh the page.',
    }),
    getCurrentUserEntitlements(),
  ]);
  if (!routeContext.ok) {
    return routeContext.error;
  }

  if (
    !entitlements.isAuthenticated ||
    !entitlements.userId ||
    !entitlements.isAdmin
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  return children;
}
