import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { getAdminCosts, getCostsLastRefreshedAt } from '@/lib/admin/costs';
import { CostsTable } from './CostsTable';

export const metadata: Metadata = {
  title: 'Costs | Admin',
};

export const runtime = 'nodejs';

export default async function AdminCostsPage() {
  const [items, lastRefreshed] = await Promise.all([
    getAdminCosts(),
    getCostsLastRefreshedAt(),
  ]);

  const refreshedLabel = lastRefreshed
    ? lastRefreshed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'never (seed on load)';

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
