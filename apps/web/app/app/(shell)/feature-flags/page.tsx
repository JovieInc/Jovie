import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  CONTENT_TABLE_CELL_CLASS,
  CONTENT_TABLE_HEAD_CELL_CLASS,
  CONTENT_TABLE_HEAD_ROW_CLASS,
  CONTENT_TABLE_ROW_CLASS,
  ContentTable,
} from '@/components/molecules/ContentTable';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  isEnabled,
} from '@/lib/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feature Flags',
  description: 'Environment-driven feature flags and current state.',
};

interface FlagRow {
  readonly name: FeatureFlag;
  readonly enabled: boolean;
  readonly defaultValue: boolean;
}

function FeatureFlagStatePill({
  enabled,
}: Readonly<{ readonly enabled: boolean }>) {
  return (
    <span
      className={
        enabled
          ? 'inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-500/12 px-2 py-0.5 text-[11.5px] font-medium text-cyan-300'
          : 'inline-flex items-center rounded-full border border-subtle bg-surface-0 px-2 py-0.5 text-[11.5px] font-medium text-tertiary-token'
      }
    >
      {enabled ? 'On' : 'Off'}
    </span>
  );
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
    <AdminToolPage
      title='Feature Flags'
      description='Environment-driven flags and current state.'
      testId='feature-flags-page'
    >
      <ContentSurfaceCard surface='table' className='overflow-hidden'>
        <ContentTable wrapperClassName='px-0 py-0' className='text-[12.5px]'>
          <thead>
            <tr className={CONTENT_TABLE_HEAD_ROW_CLASS}>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Flag</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>State</th>
              <th className={CONTENT_TABLE_HEAD_CELL_CLASS}>Default</th>
            </tr>
          </thead>
          <tbody>
            {flags.map(flag => (
              <tr key={flag.name} className={CONTENT_TABLE_ROW_CLASS}>
                <td className={CONTENT_TABLE_CELL_CLASS}>
                  <div className='font-medium text-primary-token'>
                    {flag.name}
                  </div>
                </td>
                <td className={CONTENT_TABLE_CELL_CLASS}>
                  <FeatureFlagStatePill enabled={flag.enabled} />
                </td>
                <td className={CONTENT_TABLE_CELL_CLASS}>
                  <span className='text-tertiary-token'>
                    {flag.defaultValue ? 'On' : 'Off'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </ContentTable>
      </ContentSurfaceCard>
    </AdminToolPage>
  );
}
