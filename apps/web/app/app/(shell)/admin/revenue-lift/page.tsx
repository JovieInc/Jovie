import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { captureError } from '@/lib/error-tracking';
import { loadRevenueLiftDashboard } from '@/lib/metrics/revenue-lift-dashboard';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { RevenueLiftDashboardView } from './RevenueLiftDashboardView';

export const metadata: Metadata = {
  title: 'Revenue Lift | Admin',
  description:
    'North star IRPAA + KPI tree from the canonical metrics layer (ops/VC).',
  robots: NOINDEX_ROBOTS,
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminRevenueLiftPage() {
  let data: Awaited<ReturnType<typeof loadRevenueLiftDashboard>> | null = null;

  try {
    data = await loadRevenueLiftDashboard();
  } catch (error) {
    await captureError('Admin revenue-lift dashboard failed to load', error, {
      route: 'admin/revenue-lift',
    });
  }

  return (
    <AdminPage
      title='Revenue Lift'
      description='North star IRPAA and KPI tree from the canonical metrics layer. Internal ops / VC surface — every tile names its source.'
      testId='admin-revenue-lift-page'
      viewTestId='admin-revenue-lift-content'
    >
      {data ? (
        <RevenueLiftDashboardView data={data} />
      ) : (
        <div
          className='rounded-md border border-subtle bg-surface-1 px-4 py-6 text-sm text-secondary-token'
          data-testid='admin-revenue-lift-error'
        >
          Could not load revenue-lift metrics. Check server logs and
          workflow_run_outcomes availability.
        </div>
      )}
    </AdminPage>
  );
}
