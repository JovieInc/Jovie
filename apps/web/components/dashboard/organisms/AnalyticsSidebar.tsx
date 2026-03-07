'use client';

/**
 * AnalyticsSidebar Component
 *
 * A right drawer sidebar that displays audience analytics organized
 * into tabs: Funnel, Engagement, Sources. Uses EntitySidebarShell
 * for consistent layout with other entity sidebars.
 */

import { SegmentControl } from '@jovie/ui';
import { ArrowDown, Globe, Link2, MapPin } from 'lucide-react';
import { useCallback, useState } from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
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

      {/* Arrow connector between stages — always reserve space to prevent layout shift */}
      {!isLast && (
        <div className='flex flex-col items-center py-2 min-h-[40px]'>
          <ArrowDown className='h-3.5 w-3.5 text-tertiary-token/60' />
          <span
            className={cn(
              'text-[11px] font-medium mt-0.5 tabular-nums min-h-[16px]',
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
  icon: IconComponent,
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
        <IconComponent className='h-3.5 w-3.5 text-tertiary-token' />
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
/*  Tab content components                                             */
/* ------------------------------------------------------------------ */

type AnalyticsTab = 'engagement' | 'sources';

const ANALYTICS_TAB_OPTIONS = [
  { value: 'engagement' as const, label: 'Engagement' },
  { value: 'sources' as const, label: 'Sources' },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

const numberFormatter = new Intl.NumberFormat();

export interface AnalyticsSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function AnalyticsSidebar({ isOpen, onClose }: AnalyticsSidebarProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('engagement');

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
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Analytics'
      data-testid='analytics-sidebar'
      title='Analytics'
      onClose={onClose}
    >
      <div
        className={cn(
          'space-y-5 transition-opacity duration-150',
          isFetching && !loading && 'opacity-60'
        )}
      >
        {/* Funnel — always visible at top */}
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

        {/* Tab selector + range toggle inline */}
        <div className='flex items-center gap-2'>
          <SegmentControl
            value={activeTab}
            onValueChange={setActiveTab}
            options={ANALYTICS_TAB_OPTIONS}
            size='sm'
            className='flex-1'
            aria-label='Analytics view'
          />
          <SidebarRangeToggle value={range} onChange={setRange} />
        </div>

        {/* Engagement tab — always render all 4 rows to prevent layout shift */}
        {activeTab === 'engagement' && (
          <div className='divide-y divide-subtle min-h-[160px]'>
            <StatRow
              label='Capture Rate'
              value={
                loading
                  ? ''
                  : typeof data?.capture_rate === 'number'
                    ? `${data.capture_rate}%`
                    : '--'
              }
              loading={loading}
            />
            <StatRow
              label='Listen Clicks'
              value={
                loading
                  ? ''
                  : typeof data?.listen_clicks === 'number'
                    ? fmt.format(data.listen_clicks)
                    : '--'
              }
              loading={loading}
            />
            <StatRow
              label='Total Clicks'
              value={
                loading
                  ? ''
                  : typeof data?.total_clicks === 'number'
                    ? fmt.format(data.total_clicks)
                    : '--'
              }
              loading={loading}
            />
            <StatRow
              label='Identified Users'
              value={
                loading
                  ? ''
                  : typeof data?.identified_users === 'number'
                    ? fmt.format(data.identified_users)
                    : '--'
              }
              loading={loading}
            />
          </div>
        )}

        {/* Sources tab — min-height prevents layout shift when switching tabs */}
        {activeTab === 'sources' && (
          <div className='space-y-5 min-h-[160px]'>
            <RankedList
              title='Top Cities'
              icon={MapPin}
              loading={loading}
              items={
                loading
                  ? []
                  : (data?.top_cities ?? []).slice(0, 5).map(c => ({
                      key: c.city,
                      label: c.city,
                      value: fmt.format(c.count),
                    }))
              }
              emptyMessage='No city data yet'
            />
            <RankedList
              title='Traffic Sources'
              icon={Globe}
              loading={loading}
              items={
                loading
                  ? []
                  : (data?.top_referrers ?? []).slice(0, 5).map(r => ({
                      key: r.referrer || 'direct',
                      label: r.referrer || 'Direct',
                      value: fmt.format(r.count),
                    }))
              }
              emptyMessage='No referrer data yet'
            />
            <RankedList
              title='Top Links'
              icon={Link2}
              loading={loading}
              items={
                loading
                  ? []
                  : (data?.top_links ?? []).slice(0, 5).map(link => ({
                      key: link.id,
                      label: link.url,
                      value: fmt.format(link.clicks),
                    }))
              }
              emptyMessage='No link data yet'
            />
          </div>
        )}
      </div>
    </EntitySidebarShell>
  );
}
