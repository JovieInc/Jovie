'use client';

import { SegmentControl } from '@jovie/ui';
import { Globe, Link2, MapPin } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useDashboardAnalyticsQuery } from '@/lib/queries/useDashboardAnalyticsQuery';
import { cn } from '@/lib/utils';
import type { AnalyticsRange } from '@/types/analytics';

interface RangeOption {
  value: AnalyticsRange;
  label: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

type AnalyticsTab = 'cities' | 'sources' | 'links';

const ANALYTICS_TAB_OPTIONS = [
  { value: 'cities' as const, label: 'Cities' },
  { value: 'sources' as const, label: 'Sources' },
  { value: 'links' as const, label: 'Links' },
];

const numberFormatter = new Intl.NumberFormat();

function SidebarRangeToggle({
  value,
  onChange,
}: {
  readonly value: AnalyticsRange;
  readonly onChange: (v: AnalyticsRange) => void;
}) {
  return (
    <div className='inline-flex items-center rounded-full border border-subtle bg-surface-1 p-0.5'>
      {RANGE_OPTIONS.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type='button'
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-full px-3 py-1 text-[13px] font-[510] transition-all duration-150',
              active
                ? 'bg-surface-3 text-primary-token'
                : 'text-tertiary-token hover:text-secondary-token hover:bg-surface-2'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function EngagementMetric({
  label,
  value,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly loading: boolean;
}) {
  return (
    <div className='flex min-w-0 flex-1 flex-col rounded-xl border border-subtle bg-surface-1 px-3 py-3'>
      {loading ? (
        <>
          <LoadingSkeleton height='h-8' width='w-14' rounded='sm' />
          <LoadingSkeleton
            height='h-3'
            width='w-20'
            rounded='sm'
            className='mt-2'
          />
        </>
      ) : (
        <>
          <p className='text-3xl font-[590] tracking-[-0.02em] text-primary-token tabular-nums'>
            {value}
          </p>
          <p className='mt-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
            {label}
          </p>
        </>
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
      <ul className='space-y-1.5'>
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
      <p className='py-4 text-[13px] text-tertiary-token'>{emptyMessage}</p>
    );
  }

  return (
    <ul className='space-y-1.5'>
      {items.map((item, index) => (
        <li
          key={item.key}
          className='group flex h-8 items-center justify-between rounded-lg px-2'
        >
          <div className='flex min-w-0 flex-1 items-center gap-2'>
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
          'space-y-4 transition-opacity duration-150',
          isFetching && !loading && 'opacity-70'
        )}
      >
        <div className='flex gap-2'>
          <EngagementMetric
            label='Total Clicks'
            value={
              loading ? '' : numberFormatter.format(data?.total_clicks ?? 0)
            }
            loading={loading}
          />
          <EngagementMetric
            label='Listen Clicks'
            value={
              loading ? '' : numberFormatter.format(data?.listen_clicks ?? 0)
            }
            loading={loading}
          />
          <EngagementMetric
            label='Capture Rate'
            value={loading ? '' : `${data?.capture_rate ?? 0}%`}
            loading={loading}
          />
        </div>

        <div className='flex items-center gap-2'>
          <SegmentControl
            value={activeTab}
            onValueChange={value => setActiveTab(value as AnalyticsTab)}
            options={ANALYTICS_TAB_OPTIONS}
            size='sm'
            className='flex-1'
            aria-label='Analytics data tabs'
          />
          <SidebarRangeToggle value={range} onChange={setRange} />
        </div>

        <div className='min-h-[212px] rounded-xl border border-subtle bg-surface-0 p-2'>
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
        </div>
      </div>
    </EntitySidebarShell>
  );
}
