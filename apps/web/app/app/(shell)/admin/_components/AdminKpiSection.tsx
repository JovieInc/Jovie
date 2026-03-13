import { FunnelMetricsStrip } from '@/components/admin/FunnelMetricsStrip';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

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
      <section className='space-y-3'>
        <div className='h-5 w-20 rounded skeleton' />
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          {Array.from({ length: 6 }, (_, i) => (
            <ContentMetricCardSkeleton key={`core-${i + 1}`} />
          ))}
        </div>
      </section>
      <section className='space-y-3'>
        <div className='h-5 w-20 rounded skeleton' />
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }, (_, i) => (
            <ContentMetricCardSkeleton key={`yc-${i + 1}`} showIcon={false} />
          ))}
        </div>
      </section>
    </section>
  );
}
