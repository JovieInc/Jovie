'use client';

import { ChevronRight } from 'lucide-react';
import { ContentMetricStat } from '@/components/molecules/ContentMetricStat';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useDashboardAnalyticsQuery } from '@/lib/queries';

const numberFormatter = new Intl.NumberFormat();

function FunnelStep({
  label,
  value,
  rate,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly rate?: string;
  readonly loading?: boolean;
}) {
  if (loading) {
    return (
      <div className='flex-1 min-w-0'>
        <LoadingSkeleton
          height='h-3'
          width='w-16'
          rounded='sm'
          className='mb-2'
        />
        <LoadingSkeleton height='h-6' width='w-12' rounded='sm' />
      </div>
    );
  }

  return (
    <ContentMetricStat
      className='flex-1 min-w-0'
      label={label}
      value={value}
      subtitle={rate}
      labelClassName='truncate text-app font-caption tracking-normal text-secondary-token'
      valueClassName='text-xl font-semibold leading-none tracking-[-0.011em] text-primary-token tabular-nums'
      subtitleClassName='text-2xs text-tertiary-token tabular-nums'
    />
  );
}

function FunnelArrow() {
  return (
    <div className='flex items-center px-1 text-tertiary-token/40'>
      <ChevronRight className='h-3.5 w-3.5' />
    </div>
  );
}

export function AudienceFunnelMetrics() {
  const { data, isLoading } = useDashboardAnalyticsQuery({
    range: '30d',
    view: 'traffic',
  });

  const fmt = numberFormatter;

  const profileViews = data?.profile_views ?? 0;
  const uniqueVisitors = data?.unique_users ?? 0;
  const subscribers = data?.subscribers ?? 0;

  const visitorRate =
    profileViews > 0
      ? `${Math.round((uniqueVisitors / profileViews) * 100)}% of views`
      : undefined;

  const subscriberRate =
    uniqueVisitors > 0
      ? `${Math.round((subscribers / uniqueVisitors) * 100)}% conversion`
      : undefined;

  return (
    <ContentSurfaceCard className='flex items-center gap-1 px-4 py-3'>
      <FunnelStep
        label='Views'
        value={fmt.format(profileViews)}
        loading={isLoading}
      />
      <FunnelArrow />
      <FunnelStep
        label='Visitors'
        value={fmt.format(uniqueVisitors)}
        rate={visitorRate}
        loading={isLoading}
      />
      <FunnelArrow />
      <FunnelStep
        label='Subscribers'
        value={fmt.format(subscribers)}
        rate={subscriberRate}
        loading={isLoading}
      />
    </ContentSurfaceCard>
  );
}
