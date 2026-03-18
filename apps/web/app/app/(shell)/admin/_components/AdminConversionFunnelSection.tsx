import { ArrowDown, Filter } from 'lucide-react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getConversionFunnelData } from '@/lib/admin/conversion-funnel';

function formatPercent(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export async function AdminConversionFunnelSection() {
  const funnel = await getConversionFunnelData('all');

  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='User conversion funnel'
        subtitle='All-time: signup → profile → complete → subscribers → paid'
        className='min-h-0 px-5 py-3'
      />

      {funnel.errors.length > 0 ? (
        <div className='px-5 pb-4'>
          <p className='text-xs text-[var(--color-danger)]'>
            {funnel.errors.join('; ')}
          </p>
        </div>
      ) : null}

      <div className='grid gap-4 px-5 py-4 pt-3 sm:grid-cols-5'>
        {funnel.stages.map((stage, i) => (
          <ContentMetricCard
            key={stage.key}
            icon={i === 0 ? Filter : ArrowDown}
            iconClassName={'text-tertiary-token'}
            label={stage.label}
            value={stage.count.toLocaleString()}
            subtitle={
              stage.conversionRate !== null
                ? `${formatPercent(stage.conversionRate)} from prev`
                : 'Top of funnel'
            }
          />
        ))}
      </div>
    </ContentSurfaceCard>
  );
}

export function AdminConversionFunnelSectionSkeleton() {
  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-40'
        descriptionWidth='w-64'
        className='min-h-0 px-5 py-3'
      />
      <div className='grid gap-4 px-5 py-4 pt-3 sm:grid-cols-5'>
        {Array.from({ length: 5 }, (_, i) => (
          <ContentMetricCardSkeleton key={`funnel-${i + 1}`} />
        ))}
      </div>
    </ContentSurfaceCard>
  );
}
