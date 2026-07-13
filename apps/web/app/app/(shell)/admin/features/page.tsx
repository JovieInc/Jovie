import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { captureError } from '@/lib/error-tracking';
import {
  type FeatureFlagAdminRow,
  getFeatureFlagAdminRows,
} from '@/lib/flags/admin-features.server';
import { getFlagEnvTier } from '@/lib/flags/env-tier';
import { AdminFeaturesTable } from './AdminFeaturesTable';

export const metadata: Metadata = {
  title: 'Features | Admin',
};

export const runtime = 'nodejs';

export default async function AdminFeaturesPage() {
  let rows: FeatureFlagAdminRow[] = [];
  try {
    rows = await getFeatureFlagAdminRows();
  } catch (error) {
    await captureError('Admin features page failed to load flags', error, {
      route: 'admin/features',
    });
  }

  return (
    <AdminPage
      title='Features'
      description='Runtime feature flags. Toggle per environment — changes take effect on the next request, no redeploy.'
      testId='admin-features-page'
    >
      <AdminFeaturesTable initialRows={rows} currentTier={getFlagEnvTier()} />
    </AdminPage>
  );
}
