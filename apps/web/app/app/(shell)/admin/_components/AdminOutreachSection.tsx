import { OutreachPipelineCard } from '@/components/admin/OutreachPipelineCard';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentMetricRowSkeleton } from '@/components/molecules/ContentMetricRowSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

export async function AdminOutreachSection() {
  const metrics = await getAdminFunnelMetrics();

  return (
    <section data-testid='admin-outreach-section'>
      <OutreachPipelineCard metrics={metrics} />
    </section>
  );
}

export function AdminOutreachSectionSkeleton() {
  return (
    <section>
      <ContentSurfaceCard className='h-full overflow-hidden' aria-hidden='true'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-28'
          descriptionWidth='w-44'
          actionWidths={['w-14']}
          className='min-h-0 px-5 py-4'
        />
        <div className='space-y-4 px-5 py-4'>
          <div className='flex items-center gap-2'>
            <ContentMetricCardSkeleton className='flex-1 p-3' />
            <div className='h-4 w-4 rounded skeleton' />
            <ContentMetricCardSkeleton className='flex-1 p-3' />
          </div>
          <div className='space-y-2 rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-3'>
            <div className='h-3 w-24 rounded skeleton' />
            <ContentMetricRowSkeleton className='rounded-[8px] px-2.5 py-2' />
            <ContentMetricRowSkeleton className='rounded-[8px] px-2.5 py-2' />
            <ContentMetricRowSkeleton className='rounded-[8px] px-2.5 py-2' />
          </div>
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
