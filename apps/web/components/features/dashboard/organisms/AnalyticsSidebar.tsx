'use client';

import { ArrowDown, Globe, Link2, MapPin } from 'lucide-react';
import { type ComponentType, useCallback, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import {
  DrawerSurfaceCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { AnalyticsRange } from '@/types/analytics';

/**
 * Calculate conversion rate between two funnel stages.
 * Returns null when the denominator is 0 to avoid division by zero.
 */
export function calculateConversionRate(
  current: number,
  previous: number
): string | null {
  if (previous === 0) return null;
  return `${Math.round((current / previous) * 100)}%`;
}

interface RangeOption {
  value: AnalyticsRange;
  label: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

type AnalyticsTab = 'cities' | 'countries' | 'sources' | 'links';

const ANALYTICS_TAB_OPTIONS = [
  { value: 'cities' as const, label: 'Cities' },
  { value: 'countries' as const, label: 'Countries' },
  { value: 'sources' as const, label: 'Sources' },
  { value: 'links' as const, label: 'Links' },
];

const numberFormatter = new Intl.NumberFormat();

function formatEngagementValue(
  loading: boolean,
  value: number | undefined | null
): string {
  if (loading) return '';
  if (typeof value === 'number') return numberFormatter.format(value);
  return '--';
}

function SidebarRangeToggle({
  value,
  onChange,
}: {
  readonly value: AnalyticsRange;
  readonly onChange: (v: AnalyticsRange) => void;
}) {
  return (
    <AppSegmentControl
      value={value}
      onValueChange={onChange}
      options={RANGE_OPTIONS}
      size='sm'
      className='shrink-0'
      aria-label='Analytics time range'
    />
  );
}

const FUNNEL_WIDTHS = ['100%', '75%', '55%'] as const;

function FunnelStage({
  label,
  value,
  description,
  conversionRate,
  stageIndex,
  isLast,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly description: string;
  readonly conversionRate: string | null;
  readonly stageIndex: number;
  readonly isLast: boolean;
  readonly loading: boolean;
}) {
  const width = FUNNEL_WIDTHS[stageIndex] ?? '50%';

  if (loading) {
    return (
      <div className='flex w-full flex-col items-center'>
        <div className='w-full' style={{ maxWidth: width }}>
          <DrawerSurfaceCard className='px-3 py-2 text-center'>
            <LoadingSkeleton
              height='h-3'
              width='w-20'
              rounded='sm'
              className='mx-auto mb-2'
            />
            <LoadingSkeleton
              height='h-7'
              width='w-16'
              rounded='sm'
              className='mx-auto'
            />
          </DrawerSurfaceCard>
        </div>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col items-center'>
      <div className='w-full' style={{ maxWidth: width }}>
        <DrawerSurfaceCard
          className={cn(
            'relative overflow-hidden px-3 py-2 text-center',
            isLast ? 'border-default bg-surface-1' : 'bg-surface-1'
          )}
        >
          <p className='mb-1.5 text-[13px] font-[510] tracking-normal text-secondary-token'>
            {label}
          </p>
          <p className='text-2xl font-[590] tracking-[-0.011em] text-primary-token tabular-nums'>
            {value}
          </p>
          <p className='mt-0.5 text-[11px] text-secondary-token'>
            {description}
          </p>
        </DrawerSurfaceCard>
      </div>

      {!isLast && (
        <div className='flex min-h-[32px] flex-col items-center py-1.5'>
          <ArrowDown className='h-3.5 w-3.5 text-tertiary-token/60' />
          <span
            className={cn(
              'mt-0.5 min-h-[16px] text-[11px] font-[510] tabular-nums',
              conversionRate ? 'text-accent' : 'text-transparent'
            )}
          >
            {conversionRate ?? '—'}
          </span>
        </div>
      )}
    </div>
  );
}

interface RankedItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function RankedList({
  icon: IconComponent,
  items,
  loading,
  emptyMessage,
}: {
  readonly icon: ComponentType<{ className?: string }>;
  readonly items: readonly RankedItem[];
  readonly loading: boolean;
  readonly emptyMessage: string;
}) {
  if (loading) {
    return (
      <ul className='min-h-[196px] space-y-1'>
        {[1, 2, 3, 4, 5].map(i => (
          <li
            key={i}
            className='flex h-8 items-center justify-between rounded-lg px-2'
          >
            <div className='flex items-center gap-2'>
              <LoadingSkeleton height='h-3' width='w-3' rounded='sm' />
              <LoadingSkeleton height='h-3' width='w-32' rounded='sm' />
            </div>
            <LoadingSkeleton height='h-3' width='w-8' rounded='sm' />
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <div className='min-h-[196px]'>
        <p className='py-4 text-[13px] text-tertiary-token'>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className='min-h-[196px] space-y-1.5'>
      {items.map((item, index) => (
        <li
          key={item.key}
          className='group flex h-8 items-center justify-between rounded-full px-2'
        >
          <div className='flex min-w-0 flex-1 items-center gap-1.5'>
            <span className='w-3 text-[11px] font-[510] text-tertiary-token tabular-nums'>
              {index + 1}
            </span>
            <IconComponent className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='truncate text-[13px] text-secondary-token transition-colors group-hover:text-primary-token'>
              {item.label}
            </span>
          </div>
          <span className='ml-2 text-[13px] font-[510] text-primary-token tabular-nums'>
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EngagementMetricCard({
  label,
  value,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly loading: boolean;
}) {
  const showSkeleton = loading || !value;

  return (
    <DrawerSurfaceCard className='min-h-[68px] p-2.5'>
      {showSkeleton ? (
        <>
          <LoadingSkeleton
            height='h-7'
            width='w-14'
            rounded='sm'
            className='mb-2'
          />
          <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
        </>
      ) : (
        <>
          <p className='text-xl font-[590] tracking-[-0.011em] text-primary-token tabular-nums'>
            {value}
          </p>
          <p className='mt-1 text-[11px] text-tertiary-token'>{label}</p>
        </>
      )}
    </DrawerSurfaceCard>
  );
}

export interface AnalyticsSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function AnalyticsSidebar({ isOpen, onClose }: AnalyticsSidebarProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('cities');

  const { data, isLoading, isFetching } = useDashboardAnalyticsQuery({
    range,
    view: 'full',
    enabled: true,
  });

  const loading = isLoading;

  const stages = [
    {
      label: 'Profile Views',
      value: data?.profile_views ?? 0,
      description: 'Total page visits',
    },
    {
      label: 'Unique Visitors',
      value: data?.unique_users ?? 0,
      description: 'Distinct users',
    },
    {
      label: 'Followers',
      value: data?.subscribers ?? 0,
      description: 'Opted-in contacts',
    },
  ];

  const calculateRate = useCallback(
    (current: number, previous: number) =>
      calculateConversionRate(current, previous),
    []
  );

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Analytics'
      data-testid='analytics-sidebar'
      title='Analytics'
      onClose={onClose}
    >
      <div
        className={cn(
          'space-y-2 transition-opacity duration-150',
          isFetching && !loading && 'opacity-70'
        )}
      >
        <div className='flex min-h-[280px] flex-col items-center gap-0'>
          {stages.map((stage, index) => {
            const isLast = index === stages.length - 1;
            const nextStage = isLast ? null : stages[index + 1];
            const conversionRate = nextStage
              ? calculateRate(nextStage.value, stage.value)
              : null;

            return (
              <FunnelStage
                key={stage.label}
                label={stage.label}
                value={numberFormatter.format(stage.value)}
                description={stage.description}
                conversionRate={conversionRate}
                stageIndex={index}
                isLast={isLast}
                loading={loading}
              />
            );
          })}
        </div>

        <div className='grid grid-cols-3 gap-1.5'>
          <EngagementMetricCard
            label='Total Clicks'
            value={formatEngagementValue(loading, data?.total_clicks)}
            loading={loading}
          />
          <EngagementMetricCard
            label='Listen Clicks'
            value={formatEngagementValue(loading, data?.listen_clicks)}
            loading={loading}
          />
          <EngagementMetricCard
            label='Captures'
            value={formatEngagementValue(loading, data?.subscribers)}
            loading={loading}
          />
        </div>

        <div className='space-y-2'>
          <DrawerTabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as AnalyticsTab)}
            options={ANALYTICS_TAB_OPTIONS}
            className='w-full'
            ariaLabel='Analytics data tabs'
          />
          <div className='flex justify-end'>
            <SidebarRangeToggle value={range} onChange={setRange} />
          </div>
        </div>

        <DrawerSurfaceCard className='min-h-[196px] p-2'>
          {activeTab === 'cities' && (
            <RankedList
              icon={MapPin}
              loading={loading}
              items={(data?.top_cities ?? []).slice(0, 5).map(city => ({
                key: city.city,
                label: city.city,
                value: numberFormatter.format(city.count),
              }))}
              emptyMessage='No city data yet'
            />
          )}
          {activeTab === 'countries' && (
            <RankedList
              icon={Globe}
              loading={loading}
              items={(data?.top_countries ?? []).slice(0, 5).map(country => ({
                key: country.country,
                label: country.country,
                value: numberFormatter.format(country.count),
              }))}
              emptyMessage='No country data yet'
            />
          )}
          {activeTab === 'sources' && (
            <RankedList
              icon={Globe}
              loading={loading}
              items={(data?.top_referrers ?? []).slice(0, 5).map(referrer => ({
                key: referrer.referrer || 'direct',
                label: referrer.referrer || 'Direct',
                value: numberFormatter.format(referrer.count),
              }))}
              emptyMessage='No source data yet'
            />
          )}
          {activeTab === 'links' && (
            <RankedList
              icon={Link2}
              loading={loading}
              items={(data?.top_links ?? []).slice(0, 5).map(link => ({
                key: link.id,
                label: link.url,
                value: numberFormatter.format(link.clicks),
              }))}
              emptyMessage='No link data yet'
            />
          )}
        </DrawerSurfaceCard>
      </div>
    </EntitySidebarShell>
  );
}
