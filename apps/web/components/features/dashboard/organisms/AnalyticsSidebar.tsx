'use client';

import { Globe, Link2, MapPin } from 'lucide-react';
import { type ComponentType, useCallback, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import {
  DrawerSurfaceCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
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

function formatMetricValue(
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

/** Single column in the funnel metrics card */
function FunnelColumn({
  label,
  value,
  description,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly description: string;
  readonly loading: boolean;
}) {
  if (loading) {
    return (
      <div className='flex flex-1 flex-col items-center justify-center px-2 py-3'>
        <LoadingSkeleton
          height='h-3'
          width='w-16'
          rounded='sm'
          className='mb-2'
        />
        <LoadingSkeleton height='h-6' width='w-12' rounded='sm' />
      </div>
    );
  }

  return (
    <div className='flex flex-1 flex-col items-center justify-center px-2 py-3 text-center'>
      <p className='text-[11px] font-[510] text-tertiary-token'>{label}</p>
      <p className='mt-1 text-[20px] font-[590] leading-none tracking-[-0.02em] text-primary-token tabular-nums'>
        {value}
      </p>
      <p className='mt-1 text-[10px] text-tertiary-token'>{description}</p>
    </div>
  );
}

/** Single column in the engagement metrics row */
function EngagementColumn({
  label,
  value,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly loading: boolean;
}) {
  if (loading) {
    return (
      <div className='flex flex-1 flex-col items-center justify-center px-2 py-2.5'>
        <LoadingSkeleton
          height='h-5'
          width='w-10'
          rounded='sm'
          className='mb-1'
        />
        <LoadingSkeleton height='h-3' width='w-14' rounded='sm' />
      </div>
    );
  }

  return (
    <div className='flex flex-1 flex-col items-center justify-center px-2 py-2.5 text-center'>
      <p className='text-[16px] font-[590] leading-none tracking-[-0.011em] text-primary-token tabular-nums'>
        {value}
      </p>
      <p className='mt-1 text-[10px] text-tertiary-token'>{label}</p>
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
    <ul className='min-h-[196px] space-y-0.5'>
      {items.map((item, index) => (
        <li
          key={item.key}
          className='group flex h-8 items-center justify-between rounded-lg px-2 transition-colors hover:bg-surface-1'
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
          <span className='ml-2 text-[13px] font-[590] text-primary-token tabular-nums'>
            {item.value}
          </span>
        </li>
      ))}
    </ul>
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

  const conversionRates = stages
    .slice(0, -1)
    .map((stage, i) => calculateRate(stages[i + 1].value, stage.value));

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
          'space-y-2.5 transition-opacity duration-150',
          isFetching && !loading && 'opacity-70'
        )}
      >
        {/* Funnel + Engagement — one cohesive card */}
        <div
          className={cn(
            LINEAR_SURFACE.sidebarCard,
            'overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          )}
        >
          {/* Funnel: 3-column horizontal layout */}
          <div className='flex items-stretch divide-x divide-(--linear-app-frame-seam)'>
            {stages.map((stage, index) => {
              const showRate = index < conversionRates.length;
              return (
                <div key={stage.label} className='relative flex-1'>
                  <FunnelColumn
                    label={stage.label}
                    value={numberFormatter.format(stage.value)}
                    description={stage.description}
                    loading={loading}
                  />
                  {showRate && conversionRates[index] && (
                    <span className='absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-1/2 rounded-full bg-surface-0 px-1 text-[9px] font-[510] text-accent tabular-nums'>
                      {conversionRates[index]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Engagement metrics below divider */}
          <div className='flex items-stretch divide-x divide-(--linear-app-frame-seam) border-t border-(--linear-app-frame-seam)'>
            <EngagementColumn
              label='Total Clicks'
              value={formatMetricValue(loading, data?.total_clicks)}
              loading={loading}
            />
            <EngagementColumn
              label='Listen Clicks'
              value={formatMetricValue(loading, data?.listen_clicks)}
              loading={loading}
            />
            <EngagementColumn
              label='Captures'
              value={formatMetricValue(loading, data?.subscribers)}
              loading={loading}
            />
          </div>
        </div>

        {/* Tabs + range toggle — inline on same row */}
        <div className='flex items-center gap-1.5'>
          <DrawerTabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as AnalyticsTab)}
            options={ANALYTICS_TAB_OPTIONS}
            className='flex-1'
            ariaLabel='Analytics data tabs'
          />
          <SidebarRangeToggle value={range} onChange={setRange} />
        </div>

        {/* Ranked list card */}
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
