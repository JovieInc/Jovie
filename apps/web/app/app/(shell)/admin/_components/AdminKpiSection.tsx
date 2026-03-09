import { Skeleton } from '@jovie/ui';
import { FunnelMetricsStrip } from '@/components/admin/FunnelMetricsStrip';
import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

const KPI_SKELETON_KEYS = Array.from({ length: 5 }, (_, i) => `kpi-${i + 1}`);

export async function AdminKpiSection() {
  const metrics = await getAdminFunnelMetrics();

  return (
    <section id='funnel' className='space-y-6' data-testid='admin-kpi-section'>
      <FunnelMetricsStrip metrics={metrics} />
    </section>
  );
}

export function AdminKpiSectionSkeleton() {
  return (
    <section id='funnel' className='space-y-6'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
        {KPI_SKELETON_KEYS.map(key => (
          <Skeleton key={key} className='h-28 rounded-xl' />
        ))}
      </div>
    </section>
  );
}
