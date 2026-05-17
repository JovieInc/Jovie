import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  isEnabled,
} from '@/lib/feature-flags';
import { FeatureFlagsTable } from './FeatureFlagsTable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Environment-driven feature flags and current state.',
};

export interface FlagRow {
  readonly name: FeatureFlag;
  readonly enabled: boolean;
  readonly defaultValue: boolean;
}

export default async function FeatureFlagsPage() {
  const entitlements = await getCurrentUserEntitlements();
  if (
    !entitlements.isAuthenticated ||
    !entitlements.userId ||
    !entitlements.isAdmin
  ) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  const flags: readonly FlagRow[] = (
    Object.keys(FEATURE_FLAGS) as FeatureFlag[]
  ).map(name => ({
    name,
    enabled: isEnabled(name),
    defaultValue: FEATURE_FLAGS[name],
  }));

  return (
    <AdminToolPage testId='feature-flags-page'>
      <FeatureFlagsTable flags={[...flags]} />
    </AdminToolPage>
  );
}
