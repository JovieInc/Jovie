'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { useState } from 'react';
import { useDashboardAnalyticsQuery } from '@/lib/queries/useDashboardAnalyticsQuery';
import { cn } from '@/lib/utils';
import type { AnalyticsRange } from '@/types/analytics';

const numberFormatter = new Intl.NumberFormat();

interface RangeOption {
  value: AnalyticsRange;
  label: string;
  requiresPro: boolean;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: '7d', label: '7 days', requiresPro: false },
  { value: '30d', label: '30 days', requiresPro: false },
  { value: '90d', label: '90 days', requiresPro: true },
  { value: 'all', label: 'All time', requiresPro: true },
];

function StatTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className='space-y-1'>
      <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
        {label}
      </p>
      <p className='text-2xl font-semibold leading-none tracking-tight text-primary-token tabular-nums'>
        {value}
      </p>
    </div>
  );
}

export function ProfileAnalyticsSummary() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data, isLoading, isError } = useDashboardAnalyticsQuery({
    range,
    view: 'traffic',
  });

  const currentOption =
    RANGE_OPTIONS.find(o => o.value === range) ?? RANGE_OPTIONS[1];

  if (isLoading) {
    return (
      <div className='rounded-md border border-subtle/70 bg-surface/40'>
        <div className='grid grid-cols-2 divide-x divide-subtle p-3'>
          <div className='pr-3'>
            <div className='h-[10px] w-16 rounded skeleton' />
            <div className='mt-2 h-7 w-14 rounded skeleton' />
          </div>
          <div className='pl-3'>
            <div className='h-[10px] w-16 rounded skeleton' />
            <div className='mt-2 h-7 w-14 rounded skeleton' />
          </div>
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
    <div className='rounded-md border border-subtle/70 bg-surface/40'>
      <div className='grid grid-cols-2 divide-x divide-subtle p-3'>
        <div className='pr-3'>
          <StatTile
            label='Profile views'
            value={numberFormatter.format(profileViews)}
          />
        </div>
        <div className='pl-3'>
          <StatTile
            label='Link clicks'
            value={numberFormatter.format(totalClicks)}
          />
        </div>
      </div>

      {/* Time range selector */}
      <div className='flex justify-end border-t border-subtle/70 px-3 py-1.5'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              className='inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-secondary-token transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2'
            >
              <span>Last {currentOption.label}</span>
              <ChevronDown
                size={10}
                className='text-tertiary-token'
                aria-hidden='true'
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-36'>
            {RANGE_OPTIONS.map(option => {
              const isActive = option.value === range;
              return (
                <DropdownMenuItem
                  key={option.value}
                  disabled={option.requiresPro}
                  onClick={() => {
                    if (!option.requiresPro) setRange(option.value);
                  }}
                  className={cn(isActive && 'font-medium')}
                >
                  <span className='flex items-center gap-2 w-full'>
                    <span className='flex-1'>Last {option.label}</span>
                    {option.requiresPro && (
                      <Lock
                        size={12}
                        className='text-tertiary-token'
                        aria-hidden='true'
                      />
                    )}
                    {isActive && !option.requiresPro && (
                      <Check
                        size={14}
                        className='ml-auto text-primary-token'
                        aria-hidden='true'
                      />
                    )}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
