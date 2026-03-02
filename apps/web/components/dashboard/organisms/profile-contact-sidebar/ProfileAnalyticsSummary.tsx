'use client';

/**
 * ProfileAnalyticsSummary Component
 *
 * Compact analytics summary for the profile drawer header area.
 * Shows profile views and link clicks in a 2-column stat grid.
 */

import { useDashboardAnalyticsQuery } from '@/lib/queries/useDashboardAnalyticsQuery';

const numberFormatter = new Intl.NumberFormat();

function StatTile({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className='space-y-1'>
      <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
        {label}
      </p>
      <p className='text-2xl font-semibold leading-none tracking-tight text-primary-token tabular-nums'>
        {value}
      </p>
      {hint && <p className='text-[11px] text-secondary-token'>{hint}</p>}
    </div>
  );
}

export function ProfileAnalyticsSummary() {
  const { data, isLoading, isError } = useDashboardAnalyticsQuery({
    range: '30d',
    view: 'traffic',
  });

  if (isLoading) {
    return (
      <div className='grid grid-cols-2 divide-x divide-subtle rounded-md border border-subtle/70 bg-surface/40 p-3'>
        <div className='pr-3'>
          <div className='h-[10px] w-16 rounded skeleton' />
          <div className='mt-2 h-7 w-14 rounded skeleton' />
          <div className='mt-1 h-[11px] w-12 rounded skeleton' />
        </div>
        <div className='pl-3'>
          <div className='h-[10px] w-16 rounded skeleton' />
          <div className='mt-2 h-7 w-14 rounded skeleton' />
          <div className='mt-1 h-[11px] w-12 rounded skeleton' />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className='text-xs text-tertiary-token'>
        Analytics temporarily unavailable.
      </p>
    );
  }

  const profileViews = data?.profile_views ?? 0;
  const totalClicks = data?.total_clicks ?? 0;

  return (
    <div className='grid grid-cols-2 divide-x divide-subtle rounded-md border border-subtle/70 bg-surface/40 p-3'>
      <div className='pr-3'>
        <StatTile
          label='Profile views'
          value={numberFormatter.format(profileViews)}
          hint='Last 30 days'
        />
      </div>
      <div className='pl-3'>
        <StatTile
          label='Link clicks'
          value={numberFormatter.format(totalClicks)}
          hint='Last 30 days'
        />
      </div>
    </div>
  );
}
