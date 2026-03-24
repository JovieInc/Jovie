import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { FunnelMetricsStrip } from '@/features/admin/FunnelMetricsStrip';
import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

const CORE_KPI_SKELETON_KEYS = [
  'signup-rate',
  'profile-rate',
  'activation-rate',
  'subscriber-rate',
  'retention-rate',
  'conversion-rate',
] as const;

const YC_KPI_SKELETON_KEYS = ['week-1', 'week-2', 'week-3', 'week-4'] as const;

export async function AdminKpiSection() {
  const metrics = await getAdminFunnelMetrics();

  return (
    <section id='funnel' className='space-y-4' data-testid='admin-kpi-section'>
      <FunnelMetricsStrip metrics={metrics} />
    </section>
  );
}

export function AdminKpiSectionSkeleton() {
  return (
    <section id='funnel' className='space-y-4'>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-20'
          descriptionWidth='w-48'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-2 xl:grid-cols-3'>
          {CORE_KPI_SKELETON_KEYS.map(metricKey => (
            <ContentMetricCardSkeleton key={metricKey} />
          ))}
        </div>
      </ContentSurfaceCard>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-20'
          descriptionWidth='w-48'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-2 xl:grid-cols-4'>
          {YC_KPI_SKELETON_KEYS.map(metricKey => (
            <ContentMetricCardSkeleton key={metricKey} showIcon={false} />
          ))}
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
