'use client';

import { useMemo } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { Icon } from '@/components/atoms/Icon';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';

export interface DashboardOverviewToolbarProps {
  readonly range: '7d' | '30d' | '90d';
  readonly onRangeChange: (next: '7d' | '30d' | '90d') => void;
  readonly onRefresh: () => void;
}

export function DashboardOverviewToolbar({
  range,
  onRangeChange,
  onRefresh,
}: DashboardOverviewToolbarProps): React.ReactElement {
  const rangeLabel = useMemo(() => {
    if (range === '7d') return 'Last 7 days';
    if (range === '30d') return 'Last 30 days';
    return 'Last 90 days';
  }, [range]);

  return (
    <div className='flex items-center justify-end gap-2'>
      <AppSegmentControl
        value={range}
        onValueChange={onRangeChange}
        options={[
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
          { value: '90d', label: '90d' },
        ]}
        size='sm'
        aria-label='Dashboard window'
      />

      <DashboardHeaderActionButton
        ariaLabel='Refresh dashboard'
        onClick={onRefresh}
        icon={<Icon name='RefreshCw' className='h-4 w-4' />}
        label='Refresh'
        iconOnly
      />

      {rangeLabel ? (
        <p className='hidden min-w-26 whitespace-nowrap text-right text-[12.5px] text-(--linear-text-tertiary) sm:block'>
          {rangeLabel}
        </p>
      ) : null}
    </div>
  );
}
