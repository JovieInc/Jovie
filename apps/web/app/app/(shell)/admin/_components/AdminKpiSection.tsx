import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { FunnelMetricsStrip } from '@/features/admin/FunnelMetricsStrip';
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
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-20'
          descriptionWidth='w-48'
          className='min-h-0 px-5 py-3'
        />
        <div className='grid gap-4 px-5 py-4 pt-3 sm:grid-cols-2 xl:grid-cols-3'>
          {Array.from({ length: 6 }, (_, i) => (
            <ContentMetricCardSkeleton key={`core-${i + 1}`} />
          ))}
        </div>
      </ContentSurfaceCard>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-20'
          descriptionWidth='w-48'
          className='min-h-0 px-5 py-3'
        />
        <div className='grid gap-4 px-5 py-4 pt-3 sm:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }, (_, i) => (
            <ContentMetricCardSkeleton key={`yc-${i + 1}`} showIcon={false} />
          ))}
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
