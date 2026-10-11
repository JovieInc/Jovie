import type { Metadata } from 'next';
import { AdminReadUnavailable } from '@/components/features/admin/AdminReadUnavailable';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { captureError } from '@/lib/error-tracking';
import {
  type FeatureFlagAdminRow,
  getFeatureFlagAdminRows,
} from '@/lib/flags/admin-features.server';
import {
  type FeatureFlagAuditEvent,
  getFeatureFlagAuditEvents,
} from '@/lib/flags/audit-log.server';
import { getFlagEnvTier } from '@/lib/flags/env-tier';
import { AdminFeaturesTable } from './AdminFeaturesTable';
import { FeatureFlagAuditSection } from './FeatureFlagAuditSection';

export const metadata: Metadata = {
  title: 'Features | Admin',
};

export const runtime = 'nodejs';

export default async function AdminFeaturesPage() {
  await requireCurrentAdminPageAccess();

  let rows: FeatureFlagAdminRow[] | null = null;
  try {
    rows = await getFeatureFlagAdminRows();
  } catch (error) {
    await captureError('Admin features page failed to load flags', error, {
      route: 'admin/features',
    });
  }

  let auditEvents: FeatureFlagAuditEvent[] | null = null;
  try {
    auditEvents = await getFeatureFlagAuditEvents();
  } catch (error) {
    await captureError(
      'Admin features page failed to load flag audit events',
      error,
      { route: 'admin/features' }
    );
  }

  const currentTier = getFlagEnvTier();

  return (
    <AdminPage
      title='Features'
      description='Runtime feature flags. Toggle per environment — changes take effect on the next request, no redeploy.'
      testId='admin-features-page'
    >
      <div className='space-y-8'>
        {rows === null ? (
          <AdminReadUnavailable message='Feature flag values could not be read. Changes are unavailable until the current values can be verified.' />
        ) : (
          <AdminFeaturesTable initialRows={rows} currentTier={currentTier} />
        )}
        {auditEvents === null ? (
          <AdminReadUnavailable message='Flag audit history could not be read. This does not mean there are no recorded changes.' />
        ) : (
          <FeatureFlagAuditSection
            events={auditEvents}
            currentTier={currentTier}
          />
        )}
      </div>
    </AdminPage>
  );
}
