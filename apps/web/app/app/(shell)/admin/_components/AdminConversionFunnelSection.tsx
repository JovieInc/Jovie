import { ArrowDown, Filter } from 'lucide-react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getConversionFunnelData } from '@/lib/admin/conversion-funnel';
import { formatPercent } from '@/lib/admin/format';

const FUNNEL_SKELETON_KEYS = [
  'visitors',
  'profiles',
  'completed',
  'subscribers',
  'paid',
] as const;

export async function AdminConversionFunnelSection() {
  const funnel = await getConversionFunnelData('all');

  return (
    <ContentSurfaceCard className='overflow-hidden p-0'>
      <ContentSectionHeader
        title='Outbound Funnel'
        subtitle='All-time: signup → profile → complete → subscribers → paid'
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
      />

      {funnel.errors.length > 0 ? (
        <div className='px-(--linear-app-content-padding-x) pb-(--linear-app-content-padding-y)'>
          <p className='text-xs text-[var(--color-danger)]'>
            {funnel.errors.join('; ')}
          </p>
        </div>
      ) : null}

      <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-5'>
        {funnel.stages.map((stage, i) => (
          <ContentMetricCard
            key={stage.key}
            icon={i === 0 ? Filter : ArrowDown}
            iconClassName={'text-tertiary-token'}
            label={stage.label}
            value={stage.count.toLocaleString()}
            subtitle={
              stage.conversionRate === null
                ? 'Top of funnel'
                : `${formatPercent(stage.conversionRate)} from prev`
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
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
      />
      <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-5'>
        {FUNNEL_SKELETON_KEYS.map(metricKey => (
          <ContentMetricCardSkeleton key={metricKey} />
        ))}
      </div>
    </ContentSurfaceCard>
  );
}
