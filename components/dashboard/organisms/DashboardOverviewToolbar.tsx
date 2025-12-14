'use client';

import { useMemo } from 'react';

export interface DashboardOverviewToolbarProps {
  range: '7d' | '30d';
  onRangeChange: (next: '7d' | '30d') => void;
  onRefresh: () => void;
}

export function DashboardOverviewToolbar({
  range,
  onRangeChange,
  onRefresh,
}: DashboardOverviewToolbarProps): JSX.Element {
  const rangeLabel = useMemo(() => {
    return range === '7d' ? 'Last 7 days' : 'Last 30 days';
  }, [range]);

  return (
    <div className='flex items-center justify-end gap-2'>
      <div
        role='group'
        aria-label='Dashboard window'
        className='inline-flex rounded-full border border-subtle bg-surface-1/40 p-0.5 ring-1 ring-inset ring-white/5 dark:ring-white/10 backdrop-blur-sm'
      >
        {(['7d', '30d'] as const).map(value => {
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
        <svg
          className='h-3.5 w-3.5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
          aria-hidden='true'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2'
            d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
          />
        </svg>
      </button>

      {rangeLabel ? (
        <p className='hidden min-w-[6.5rem] whitespace-nowrap text-right text-xs text-tertiary-token sm:block'>
          {rangeLabel}
        </p>
      ) : null}
    </div>
  );
}
