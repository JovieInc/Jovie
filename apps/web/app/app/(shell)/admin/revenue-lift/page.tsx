import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { EmptyState } from '@/components/molecules/EmptyState';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
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
  await requireCurrentAdminPageAccess();

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
        <EmptyState
          variant='error'
          heading='Could not load revenue-lift metrics.'
          description='Check server logs and workflow_run_outcomes availability.'
          testId='admin-revenue-lift-error'
        />
      )}
    </AdminPage>
  );
}
