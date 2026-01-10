'use client';

import { useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';

export interface DashboardOverviewToolbarProps {
  range: '7d' | '30d' | '90d';
  onRangeChange: (next: '7d' | '30d' | '90d') => void;
  onRefresh: () => void;
}

export function DashboardOverviewToolbar({
  range,
  onRangeChange,
  onRefresh,
}: DashboardOverviewToolbarProps): JSX.Element {
  const rangeLabel = useMemo(() => {
    if (range === '7d') return 'Last 7 days';
    if (range === '30d') return 'Last 30 days';
    return 'Last 90 days';
  }, [range]);

  return (
    <div className='flex items-center justify-end gap-2'>
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset not appropriate for segmented control */}
      <div
        role='group'
        aria-label='Dashboard window'
        className='inline-flex rounded-full border border-subtle bg-surface-1/40 p-0.5 ring-1 ring-inset ring-white/5 dark:ring-white/10 backdrop-blur-sm'
      >
        {(['7d', '30d', '90d'] as const).map(value => {
          const active = range === value;
          return (
            <button
              key={value}
              type='button'
              onClick={() => onRangeChange(value)}
              aria-pressed={active}
              className={
                active
                  ? 'h-6 rounded-full bg-surface-1 px-2.5 text-xs font-semibold text-primary-token shadow-sm shadow-black/10 dark:shadow-black/40'
                  : 'h-6 rounded-full px-2.5 text-xs font-medium text-secondary-token transition-colors hover:bg-surface-2/40 hover:text-primary-token'
              }
            >
              {value}
            </button>
          );
        })}
      </div>

      <button
        type='button'
        aria-label='Refresh dashboard'
        onClick={onRefresh}
        className='inline-flex h-7 items-center justify-center rounded-full border border-subtle bg-surface-1/40 px-2.5 text-xs font-semibold text-primary-token ring-1 ring-inset ring-white/5 transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base dark:ring-white/10'
      >
        <Icon name='RefreshCw' className='h-3.5 w-3.5' />
      </button>

      {rangeLabel ? (
        <p className='hidden min-w-26 whitespace-nowrap text-right text-xs text-tertiary-token sm:block'>
          {rangeLabel}
        </p>
      ) : null}
    </div>
  );
}
