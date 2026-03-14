import { ReliabilityCard } from '@/components/admin/ReliabilityCard';
import { ContentMetricRowSkeleton } from '@/components/molecules/ContentMetricRowSkeleton';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getAdminReliabilitySummary } from '@/lib/admin/overview';

export async function AdminUsageSection() {
  const reliabilitySummary = await getAdminReliabilitySummary();

  return (
    <section id='errors' data-testid='admin-usage-section'>
      <ReliabilityCard summary={reliabilitySummary} />
    </section>
  );
}

export function AdminUsageSectionSkeleton() {
  return (
    <section id='errors'>
      <ContentSurfaceCard className='h-full overflow-hidden' aria-hidden='true'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-20'
          descriptionWidth='w-32'
          actionWidths={['w-16']}
          className='px-5 py-3'
        />
        <div className='space-y-3 p-5'>
          <ContentMetricRowSkeleton />
          <ContentMetricRowSkeleton />
          <ContentMetricRowSkeleton />
          <div className='h-4 w-40 rounded skeleton' />
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
