'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { useState } from 'react';
import { DrawerButton, DrawerEmptyState } from '@/components/molecules/drawer';
import { DrawerPropertyRow } from '@/components/molecules/drawer/DrawerPropertyRow';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
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

export function ProfileAnalyticsSummary() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data, isLoading, isFetching, isError } = useDashboardAnalyticsQuery({
    range,
    view: 'traffic',
  });

  const currentOption =
    RANGE_OPTIONS.find(o => o.value === range) ?? RANGE_OPTIONS[1];

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
        'space-y-0.5 transition-opacity duration-150',
        isFetching && 'opacity-50'
      )}
    >
      <DrawerPropertyRow
        label='Profile views'
        value={numberFormatter.format(profileViews)}
      />
      <DrawerPropertyRow
        label='Link clicks'
        value={numberFormatter.format(totalClicks)}
      />

      {/* Time range selector */}
      <div className='flex justify-end'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <DrawerButton
              type='button'
              tone='ghost'
              className='h-5 rounded-full border-transparent px-1.5 py-0 text-[11px] font-normal text-tertiary-token hover:text-secondary-token'
            >
              <span>Last {currentOption.label}</span>
              <ChevronDown
                size={10}
                className='text-tertiary-token'
                aria-hidden='true'
              />
            </DrawerButton>
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
