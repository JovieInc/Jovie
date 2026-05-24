import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { getAdminCosts, getCostsLastRefreshedAt } from '@/lib/admin/costs';
import { captureError } from '@/lib/error-tracking';
import { CostsTable } from './CostsTable';

export const metadata: Metadata = {
  title: 'Costs | Admin',
};

export const runtime = 'nodejs';

export default async function AdminCostsPage() {
  let items: Awaited<ReturnType<typeof getAdminCosts>> = [];
  let lastRefreshed: Awaited<ReturnType<typeof getCostsLastRefreshedAt>> = null;

  try {
    [items, lastRefreshed] = await Promise.all([
      getAdminCosts(),
      getCostsLastRefreshedAt(),
    ]);
  } catch (error) {
    await captureError('Admin costs page failed to load optional data', error, {
      route: 'admin/costs',
    });
  }

  const refreshedLabel = lastRefreshed
    ? lastRefreshed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not recorded';

  return (
    <AdminPage
      title='Costs'
      description='Manual 30-day line-item view of company infra + AI spend. Lagging data only (v1).'
      testId='admin-costs-page'
    >
      <CostsTable items={items} lastRefreshedLabel={refreshedLabel} />
    </AdminPage>
  );
}
