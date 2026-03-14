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
  DrawerButton,
  DrawerEmptyState,
  DrawerStatGrid,
  DrawerSurfaceCard,
  StatTile,
} from '@/components/molecules/drawer';
import { useDashboardAnalyticsQuery } from '@/lib/queries/useDashboardAnalyticsQuery';
import { cn } from '@/lib/utils';
import type { AnalyticsRange } from '@/types/analytics';

/** Minimum height to prevent CLS when switching time ranges */
const STAT_MIN_HEIGHT = 'min-h-[52px]';

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

  // Only show skeleton on first load (no data yet)
  if (isLoading && !data) {
    return (
      <DrawerSurfaceCard className='overflow-hidden bg-(--linear-bg-surface-0)'>
        <DrawerStatGrid className={cn('p-3.5', STAT_MIN_HEIGHT)}>
          <div className='pr-3'>
            <div className='h-[10px] w-16 rounded skeleton' />
            <div className='mt-2 h-6 w-14 rounded skeleton' />
          </div>
          <div className='pl-3'>
            <div className='h-[10px] w-16 rounded skeleton' />
            <div className='mt-2 h-6 w-14 rounded skeleton' />
          </div>
        </DrawerStatGrid>
      </DrawerSurfaceCard>
    );
  }

  if (isError && !data) {
    return <DrawerEmptyState message='No data yet.' />;
  }

  const profileViews = data?.profile_views ?? 0;
  const totalClicks = data?.total_clicks ?? 0;

  return (
    <DrawerSurfaceCard className='overflow-hidden bg-(--linear-bg-surface-0)'>
      <DrawerStatGrid
        className={cn(
          'p-3.5 transition-opacity duration-150',
          STAT_MIN_HEIGHT,
          isFetching && 'opacity-50'
        )}
      >
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
      </DrawerStatGrid>

      {/* Time range selector */}
      <div className='flex justify-end border-t border-(--linear-border-subtle) px-3 py-1.5'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <DrawerButton
              type='button'
              tone='ghost'
              className='h-6 rounded-[7px] border-transparent px-1.5 py-0.5 text-[11px] font-normal text-(--linear-text-secondary) hover:text-(--linear-text-primary)'
            >
              <span>Last {currentOption.label}</span>
              <ChevronDown
                size={10}
                className='text-(--linear-text-tertiary)'
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
                        className='text-(--linear-text-tertiary)'
                        aria-hidden='true'
                      />
                    )}
                    {isActive && !option.requiresPro && (
                      <Check
                        size={14}
                        className='ml-auto text-(--linear-text-primary)'
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
    </DrawerSurfaceCard>
  );
}
