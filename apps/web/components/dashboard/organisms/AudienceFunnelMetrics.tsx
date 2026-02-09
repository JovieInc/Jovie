'use client';

import { ChevronRight } from 'lucide-react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useDashboardAnalyticsQuery } from '@/lib/queries';

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
    <div className='flex-1 min-w-0'>
      <p className='text-[11px] font-medium uppercase tracking-wide text-tertiary-token truncate'>
        {label}
      </p>
      <p className='mt-1 text-lg font-semibold tracking-tight text-primary-token tabular-nums'>
        {value}
      </p>
      {rate && (
        <p className='mt-0.5 text-[11px] text-tertiary-token tabular-nums'>
          {rate}
        </p>
      )}
    </div>
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

  const fmt = Intl.NumberFormat();

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
    <div className='flex items-center gap-1 rounded-lg border border-subtle bg-surface-1 px-4 py-3'>
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
    </div>
  );
}
