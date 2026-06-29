import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loadAppShellRouteContext } from '@/app/app/(shell)/app-shell-route-context';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  CODE_FLAGS,
  type CodeFlagName,
  isCodeFlagEnabled,
} from '@/lib/flags/code-flags';
import { FeatureFlagsTable } from './FeatureFlagsTable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Environment-driven feature flags and current state.',
};

export interface FlagRow {
  readonly name: CodeFlagName;
  readonly enabled: boolean;
  readonly defaultValue: boolean;
}

export default async function FeatureFlagsPage() {
  const [routeContext, entitlements] = await Promise.all([
    loadAppShellRouteContext({
      route: APP_ROUTES.FEATURE_FLAGS,
      dashboardErrorLogMessage:
        'Dashboard data load failed on feature flags page',
      dashboardErrorMessage:
        'Failed to load feature flags. Please refresh the page.',
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

  const flags: readonly FlagRow[] = (
    Object.keys(CODE_FLAGS) as CodeFlagName[]
  ).map(name => ({
    name,
    enabled: isCodeFlagEnabled(name),
    defaultValue: CODE_FLAGS[name],
  }));

  return (
    <AdminPage title='' testId='feature-flags-page'>
      <FeatureFlagsTable flags={[...flags]} />
    </AdminPage>
  );
}
