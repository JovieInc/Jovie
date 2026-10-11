import type { Metadata } from 'next';
import { AdminReadUnavailable } from '@/components/features/admin/AdminReadUnavailable';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { getAdminCosts, getCostsLastRefreshedAt } from '@/lib/admin/costs';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { captureError } from '@/lib/error-tracking';
import { CostsTable } from './CostsTable';

export const metadata: Metadata = {
  title: 'Costs | Admin',
};

export const runtime = 'nodejs';

export default async function AdminCostsPage() {
  await requireCurrentAdminPageAccess();

  const [costsResult, refreshedResult] = await Promise.allSettled([
    getAdminCosts(),
    getCostsLastRefreshedAt(),
  ]);
  if (costsResult.status === 'rejected') {
    await captureError(
      'Admin costs page failed to load cost items',
      costsResult.reason,
      {
        route: 'admin/costs',
      }
    );
  }
  if (refreshedResult.status === 'rejected') {
    await captureError(
      'Admin costs page failed to load refresh time',
      refreshedResult.reason,
      {
        route: 'admin/costs',
      }
    );
  }
  const lastRefreshed =
    refreshedResult.status === 'fulfilled' ? refreshedResult.value : null;

  const refreshedLabel = lastRefreshed
    ? lastRefreshed.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short',
      })
    : refreshedResult.status === 'rejected'
      ? 'Unavailable'
      : 'Not recorded';

  return (
    <AdminPage
      title='Costs'
      description='Manual 30-day line-item view of company infra + AI spend. Lagging data only (v1).'
      testId='admin-costs-page'
    >
      {costsResult.status === 'rejected' ? (
        <AdminReadUnavailable message='Manual cost records could not be read. Spend is unknown, not zero.' />
      ) : (
        <CostsTable
          items={costsResult.value}
          lastRefreshedLabel={refreshedLabel}
        />
      )}
      {refreshedResult.status === 'rejected' ? (
        <AdminReadUnavailable message='The source refresh time could not be read. Freshness cannot be verified.' />
      ) : null}
    </AdminPage>
  );
}
