'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { useState } from 'react';
import {
  DrawerAnalyticsSummaryCard,
  DrawerButton,
} from '@/components/molecules/drawer';
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

function getProfileAnalyticsState({
  isLoading,
  isError,
  data,
}: {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly data: unknown;
}) {
  const isInitialLoading = isLoading && !data;
  const isInitialError = isError && !data;

  if (isInitialLoading) {
    return 'loading' as const;
  }

  if (isInitialError) {
    return 'error' as const;
  }

  return 'ready' as const;
}

export function ProfileAnalyticsSummary() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const { data, isLoading, isFetching, isError } = useDashboardAnalyticsQuery({
    range,
    view: 'traffic',
  });

  const currentOption =
    RANGE_OPTIONS.find(o => o.value === range) ?? RANGE_OPTIONS[1];

  const state = getProfileAnalyticsState({ isLoading, isError, data });

  const profileViews = data?.profile_views ?? 0;
  const totalClicks = data?.total_clicks ?? 0;
  const isEmpty =
    state === 'ready' &&
    data !== undefined &&
    profileViews === 0 &&
    totalClicks === 0;

  return (
    <DrawerAnalyticsSummaryCard
      metrics={
        isEmpty
          ? []
          : [
              {
                id: 'profile-views',
                label: 'Profile views',
                value: numberFormatter.format(profileViews),
                hint: 'Visitors',
              },
              {
                id: 'link-clicks',
                label: 'Link clicks',
                value: numberFormatter.format(totalClicks),
                hint: 'Outbound',
              },
            ]
      }
      state={state}
      dimmed={isFetching}
      emptyMessage='No data yet.'
      errorMessage='Analytics unavailable'
      testId='profile-analytics-summary'
      footer={
        state === 'ready' ? (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <DrawerButton
                  type='button'
                  tone='ghost'
                  className='h-6 rounded-full border-transparent px-1.5 py-0 text-[11px] font-normal text-tertiary-token hover:bg-surface-0 hover:text-secondary-token'
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
                      <span className='flex w-full items-center gap-2'>
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
        ) : undefined
      }
    />
  );
}
