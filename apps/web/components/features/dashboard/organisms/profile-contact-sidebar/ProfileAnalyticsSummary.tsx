'use client';

import { useState } from 'react';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import { DrawerPropertyRow } from '@/components/molecules/drawer/DrawerPropertyRow';
import { TimeRangeSelector } from '@/components/molecules/TimeRangeSelector';
import { CANONICAL_METRICS } from '@/lib/analytics/metrics';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { AnalyticsRange } from '@/types/analytics';

const numberFormatter = new Intl.NumberFormat();

const RANGE_VALUES: readonly AnalyticsRange[] = ['7d', '30d', '90d', 'all'];

/** Ranges gated behind a Pro plan on this surface. */
const PRO_LOCKED_RANGES: readonly AnalyticsRange[] = ['90d', 'all'];

export function ProfileAnalyticsSummary() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data, isLoading, isFetching, isError } = useDashboardAnalyticsQuery({
    range,
    view: 'traffic',
  });

  if (isLoading && !data) {
    return (
      <div className='space-y-1'>
        <div className='flex items-center gap-2 px-1 py-px'>
          <div className='h-3 w-20 rounded skeleton' />
          <div className='h-3 w-8 rounded skeleton' />
        </div>
        <div className='flex items-center gap-2 px-1 py-px'>
          <div className='h-3 w-16 rounded skeleton' />
          <div className='h-3 w-8 rounded skeleton' />
        </div>
      </div>
    );
  }

  if (isError && !data) {
    return <DrawerEmptyState message='No data yet.' />;
  }

  const profileViews = data?.profile_views ?? 0;
  const totalClicks = data?.total_clicks ?? 0;

  return (
    <div
      className={cn(
        'space-y-1 transition-opacity duration-subtle',
        isFetching && 'opacity-50'
      )}
    >
      <DrawerPropertyRow
        label={CANONICAL_METRICS.profile_views.label}
        value={numberFormatter.format(profileViews)}
      />
      {/* Display alias for CANONICAL_METRICS.total_clicks */}
      <DrawerPropertyRow
        label='Link Clicks'
        value={numberFormatter.format(totalClicks)}
      />

      {/* Time range selector */}
      <div className='flex justify-end'>
        <TimeRangeSelector
          variant='menu'
          value={range}
          onValueChange={setRange}
          ranges={RANGE_VALUES}
          lockedRanges={PRO_LOCKED_RANGES}
        />
      </div>
    </div>
  );
}
