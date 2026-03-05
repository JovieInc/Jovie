'use client';

/**
 * AnalyticsSidebar Component
 *
 * A right drawer sidebar that displays audience funnel metrics
 * in a vertical visual layout. Matches the existing drawer pattern
 * used by ReleaseSidebar and ProfileContactSidebar.
 */

import { SegmentControl } from '@jovie/ui';
import {
  ArrowDown,
  BarChart3,
  Globe,
  Link2,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { DrawerHeader } from '@/components/molecules/drawer';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { useDashboardAnalyticsQuery } from '@/lib/queries/useDashboardAnalyticsQuery';
import { cn } from '@/lib/utils';
import type { AnalyticsRange } from '@/types/analytics';

/* ------------------------------------------------------------------ */
/*  Range selector                                                     */
/* ------------------------------------------------------------------ */

interface RangeOption {
  value: AnalyticsRange;
  label: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

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
              'rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-150',
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

/* ------------------------------------------------------------------ */
/*  Vertical funnel stage                                              */
/* ------------------------------------------------------------------ */

/** Fixed funnel widths so layout doesn't shift when data changes */
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
      <div className='flex flex-col items-center w-full'>
        <div
          className='w-full rounded-xl border border-subtle bg-surface-1 px-5 py-4 text-center'
          style={{ maxWidth: width }}
        >
          <LoadingSkeleton
            height='h-3'
            width='w-20'
            rounded='sm'
            className='mb-2 mx-auto'
          />
          <LoadingSkeleton
            height='h-7'
            width='w-16'
            rounded='sm'
            className='mx-auto'
          />
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col items-center w-full'>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-xl border px-5 py-4 text-center',
          isLast
            ? 'border-accent/30 bg-gradient-to-r from-[var(--color-accent-subtle)] to-[var(--color-bg-surface-1)] ring-1 ring-accent/15'
            : 'border-subtle bg-gradient-to-r from-[var(--color-bg-surface-1)] to-[var(--color-bg-surface-2)]'
        )}
        style={{ maxWidth: width }}
      >
        <p className='text-[11px] font-semibold uppercase tracking-[0.15em] text-tertiary-token mb-1.5'>
          {label}
        </p>
        <p className='text-2xl font-bold tracking-tight text-primary-token tabular-nums'>
          {value}
        </p>
        <p className='text-[11px] text-secondary-token mt-0.5'>{description}</p>
      </div>

      {/* Arrow connector between stages */}
      {!isLast && (
        <div className='flex flex-col items-center py-2'>
          <ArrowDown className='h-3.5 w-3.5 text-tertiary-token/60' />
          {conversionRate && (
            <span className='text-[11px] font-medium text-accent mt-0.5 tabular-nums'>
              {conversionRate}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compact stat row for secondary metrics                             */
/* ------------------------------------------------------------------ */

function StatRow({
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
      <div className='flex items-center justify-between py-2'>
        <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
        <LoadingSkeleton height='h-3' width='w-10' rounded='sm' />
      </div>
    );
  }

  return (
    <div className='flex items-center justify-between py-2'>
      <span className='text-[13px] text-secondary-token'>{label}</span>
      <span className='text-[13px] font-medium text-primary-token tabular-nums'>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ranked list section                                                */
/* ------------------------------------------------------------------ */

interface RankedItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function RankedList({
  title,
  icon: Icon,
  items,
  loading,
  emptyMessage,
}: {
  readonly title: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly items: readonly RankedItem[];
  readonly loading: boolean;
  readonly emptyMessage: string;
}) {
  return (
    <div>
      <div className='mb-2 flex items-center gap-2'>
        <Icon className='h-3.5 w-3.5 text-tertiary-token' />
        <h3 className='text-[12px] font-medium text-secondary-token'>
          {title}
        </h3>
      </div>

      {loading && (
        <ul className='space-y-2'>
          {[1, 2, 3].map(i => (
            <li key={i} className='flex items-center justify-between'>
              <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
              <LoadingSkeleton height='h-3' width='w-8' rounded='sm' />
            </li>
          ))}
        </ul>
      )}
      {!loading && items.length > 0 && (
        <ul className='space-y-1.5'>
          {items.map((item, index) => (
            <li
              key={item.key}
              className='flex items-center justify-between group'
            >
              <div className='flex items-center gap-2 min-w-0 flex-1'>
                <span className='text-[11px] font-medium text-tertiary-token w-3 tabular-nums'>
                  {index + 1}
                </span>
                <span className='text-[12px] text-secondary-token group-hover:text-primary-token transition-colors truncate'>
                  {item.label}
                </span>
              </div>
              <span className='text-[12px] font-medium text-primary-token tabular-nums ml-2'>
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!loading && items.length === 0 && (
        <p className='text-[12px] text-tertiary-token py-2'>{emptyMessage}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

const numberFormatter = new Intl.NumberFormat();

export interface AnalyticsSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

type RankedTab = 'cities' | 'sources' | 'links';

const RANKED_TAB_OPTIONS = [
  { value: 'cities' as const, label: 'Cities' },
  { value: 'sources' as const, label: 'Sources' },
  { value: 'links' as const, label: 'Links' },
];

export function AnalyticsSidebar({ isOpen, onClose }: AnalyticsSidebarProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [rankedTab, setRankedTab] = useState<RankedTab>('cities');

  const { data, isLoading, isFetching } = useDashboardAnalyticsQuery({
    range,
    view: 'full',
    enabled: isOpen,
  });

  const fmt = numberFormatter;
  const loading = isLoading;

  // Funnel data
  const profileViews = data?.profile_views ?? 0;
  const uniqueVisitors = data?.unique_users ?? 0;
  const subscribers = data?.subscribers ?? 0;

  const stages = [
    {
      label: 'Profile Views',
      value: profileViews,
      description: 'Total page visits',
    },
    {
      label: 'Unique Visitors',
      value: uniqueVisitors,
      description: 'Distinct users',
    },
    {
      label: 'Followers',
      value: subscribers,
      description: 'Opted-in contacts',
    },
  ];

  const calculateRate = useCallback(
    (current: number, previous: number): string | null => {
      if (previous === 0) return null;
      return `${Math.round((current / previous) * 100)}%`;
    },
    []
  );

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Analytics'
      data-testid='analytics-sidebar'
    >
      <div className='flex h-full flex-col'>
        {/* Header — sticky so it stays visible while scrolling */}
        <div className='sticky top-0 z-10 bg-surface-1'>
          <DrawerHeader title='Analytics' onClose={onClose} />
        </div>

        {/* Content */}
        <div
          className={cn(
            'px-5 pt-4 pb-6 space-y-6 transition-opacity duration-150',
            isFetching && !loading && 'opacity-60'
          )}
        >
          {/* Range selector */}
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-2 text-tertiary-token'>
              <TrendingUp className='h-3.5 w-3.5' />
              <span className='text-[12px] font-medium'>Conversion Funnel</span>
            </div>
            <SidebarRangeToggle value={range} onChange={setRange} />
          </div>

          {/* Vertical Funnel — fixed widths to prevent layout shift */}
          <div className='flex flex-col items-center gap-0'>
            {stages.map((stage, index) => {
              const isLast = index === stages.length - 1;
              const prevStage = index > 0 ? stages[index - 1] : null;
              const conversionRate = prevStage
                ? calculateRate(stage.value, prevStage.value)
                : null;

              return (
                <FunnelStage
                  key={stage.label}
                  label={stage.label}
                  value={fmt.format(stage.value)}
                  description={stage.description}
                  conversionRate={conversionRate}
                  stageIndex={index}
                  isLast={isLast}
                  loading={loading}
                />
              );
            })}
          </div>

          {/* Secondary metrics */}
          {!loading && data && (
            <div className='border-t border-subtle pt-4'>
              <div className='flex items-center gap-2 mb-3'>
                <BarChart3 className='h-3.5 w-3.5 text-tertiary-token' />
                <h3 className='text-[12px] font-medium text-secondary-token'>
                  Engagement
                </h3>
              </div>
              <div className='divide-y divide-subtle'>
                {typeof data.capture_rate === 'number' && (
                  <StatRow
                    label='Capture Rate'
                    value={`${data.capture_rate}%`}
                    loading={false}
                  />
                )}
                {typeof data.listen_clicks === 'number' && (
                  <StatRow
                    label='Listen Clicks'
                    value={fmt.format(data.listen_clicks)}
                    loading={false}
                  />
                )}
                {typeof data.total_clicks === 'number' && (
                  <StatRow
                    label='Total Clicks'
                    value={fmt.format(data.total_clicks)}
                    loading={false}
                  />
                )}
                {typeof data.identified_users === 'number' && (
                  <StatRow
                    label='Identified Users'
                    value={fmt.format(data.identified_users)}
                    loading={false}
                  />
                )}
              </div>
            </div>
          )}

          {/* Tabbed ranked lists */}
          {!loading && data && (
            <div className='border-t border-subtle pt-4 space-y-3'>
              <SegmentControl
                value={rankedTab}
                onValueChange={setRankedTab}
                options={RANKED_TAB_OPTIONS}
                size='sm'
                aria-label='Select data view'
                className='w-full'
                triggerClassName='flex-1'
              />

              {rankedTab === 'cities' && (
                <RankedList
                  title='Top Cities'
                  icon={MapPin}
                  loading={false}
                  items={(data.top_cities ?? []).slice(0, 5).map(c => ({
                    key: c.city,
                    label: c.city,
                    value: fmt.format(c.count),
                  }))}
                  emptyMessage='No city data yet'
                />
              )}
              {rankedTab === 'sources' && (
                <RankedList
                  title='Traffic Sources'
                  icon={Globe}
                  loading={false}
                  items={(data.top_referrers ?? []).slice(0, 5).map(r => ({
                    key: r.referrer || 'direct',
                    label: r.referrer || 'Direct',
                    value: fmt.format(r.count),
                  }))}
                  emptyMessage='No referrer data yet'
                />
              )}
              {rankedTab === 'links' && (
                <RankedList
                  title='Top Links'
                  icon={Link2}
                  loading={false}
                  items={(data.top_links ?? []).slice(0, 5).map(link => ({
                    key: link.id,
                    label: link.url,
                    value: fmt.format(link.clicks),
                  }))}
                  emptyMessage='No link data yet'
                />
              )}
            </div>
          )}
        </div>
      </div>
    </RightDrawer>
  );
}
