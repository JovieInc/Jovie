import 'server-only';

import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import type { AppFlagName } from '@/lib/flags/contracts';
import { getAppFlagValue } from '@/lib/flags/server';
import type { DashboardData } from './dashboard/actions';
import { getDashboardShellData } from './dashboard/actions';

export interface AppShellRouteContext {
  readonly ok: true;
  readonly userId: string;
  readonly dashboardData: DashboardData;
  readonly profileId: string | null;
}

export interface AppShellRouteError {
  readonly ok: false;
  readonly error: ReactNode;
}

export interface LoadAppShellRouteContextOptions {
  readonly route: string;
  readonly dashboardErrorMessage: string;
  readonly dashboardErrorLogMessage?: string;
  readonly authFailure?: 'redirect' | 'notFound';
  readonly requiredFlag?: AppFlagName;
}

export type AppShellRouteContextResult =
  | AppShellRouteContext
  | AppShellRouteError;

function signInRouteFor(route: string): string {
  const signInParams = new URLSearchParams({
    redirect_url: route,
  });
  return `${APP_ROUTES.SIGNIN}?${signInParams.toString()}`;
}

export async function loadAppShellRouteContext({
  route,
  dashboardErrorMessage,
  dashboardErrorLogMessage = 'Dashboard data load failed on app shell route',
  authFailure = 'redirect',
  requiredFlag,
}: LoadAppShellRouteContextOptions): Promise<AppShellRouteContextResult> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    if (authFailure === 'notFound') {
      notFound();
    }

    redirect(signInRouteFor(route));
  }

  if (requiredFlag) {
    const enabled = await getAppFlagValue(requiredFlag, { userId });
    if (!enabled) {
      notFound();
    }
  }

  const dashboardData = await getDashboardShellData(userId);
  if (dashboardData.dashboardLoadError) {
    await captureError(
      dashboardErrorLogMessage,
      dashboardData.dashboardLoadError,
      { route }
    );
    return {
      ok: false,
      error: <PageErrorState message={dashboardErrorMessage} />,
    };
  }

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.START);
  }

  return {
    ok: true,
    userId,
    dashboardData,
    profileId: dashboardData.selectedProfile?.id ?? null,
  };
}
