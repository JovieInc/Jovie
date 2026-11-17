'use client';

// @coverage-via apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx

import { ChartColumn, Globe, Link2, MapPin } from 'lucide-react';
import { useState } from 'react';
import {
  DrawerStatGrid,
  DrawerSurfaceCard,
  EntityTabbedRail,
  StatTile,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { EmptyState } from '@/components/molecules/EmptyState';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { TimeRangeSelector } from '@/components/molecules/TimeRangeSelector';
import { APP_ROUTES } from '@/constants/routes';
import {
  describeNoAudienceActivity,
  hasAudienceActivity,
} from '@/lib/analytics/audience-activity';
import { CANONICAL_METRICS } from '@/lib/analytics/metrics';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { formatAnalyticsStageRate } from '@/lib/utils/analytics-growth';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
} from '@/types/analytics';
import { AnalyticsRankedList as RankedList } from './AnalyticsRankedList';

/**
 * Calculate conversion rate between two funnel stages.
 * Suppresses misleading percents on small bases — see formatAnalyticsStageRate.
 */
export const calculateConversionRate = formatAnalyticsStageRate;

const RANGE_VALUES: readonly AnalyticsRange[] = ['7d', '30d'];

export type AnalyticsTab = 'cities' | 'countries' | 'sources' | 'links';

const ANALYTICS_TAB_OPTIONS = [
  { value: 'cities' as const, label: 'Cities' },
  { value: 'countries' as const, label: 'Countries' },
  { value: 'sources' as const, label: 'Sources' },
  { value: 'links' as const, label: 'Links' },
];

const numberFormatter = new Intl.NumberFormat();

const RANKED_TAB_ICONS = {
  cities: MapPin,
  countries: Globe,
  sources: Globe,
  links: Link2,
} as const;

const RANKED_TAB_EMPTY = {
  cities: 'No City Data Yet',
  countries: 'No country data yet',
  sources: 'No source data yet',
  links: 'No link data yet',
} as const;

/** Top rows for one tab as [key, label, count]. */
function rankedRows(
  data: DashboardAnalyticsResponse | null | undefined,
  tab: AnalyticsTab
): readonly (readonly [string, string, number])[] {
  switch (tab) {
    case 'cities':
      return (data?.top_cities ?? []).map(r => [r.city, r.city, r.count]);
    case 'countries':
      return (data?.top_countries ?? []).map(r => [
        r.country,
        r.country,
        r.count,
      ]);
    case 'sources':
      return (data?.top_referrers ?? []).map(r => [
        r.referrer || 'direct',
        r.referrer || 'Direct',
        r.count,
      ]);
    default:
      return (data?.top_links ?? []).map(r => [r.id, r.url, r.clicks]);
  }
}

function formatMetricValue(
  loading: boolean,
  value: number | undefined | null
): string {
  if (loading) return '';
  if (typeof value === 'number') return numberFormatter.format(value);
  return '--';
}

/** Bar opacity classes that progressively fade to reinforce the narrowing funnel */
const BAR_OPACITY = [
  'bg-[color-mix(in_oklab,var(--accent-analytics)_52%,transparent)]',
  'bg-[color-mix(in_oklab,var(--accent-analytics)_36%,transparent)]',
  'bg-[color-mix(in_oklab,var(--accent-analytics)_24%,transparent)]',
] as const;

const TRACK_BG = 'bg-surface-2';

/**
 * Shared outer + metric-row chrome for FunnelStage loading/loaded.
 * Must stay identical across branches — padding drift (px-3/py-2 vs
 * px-3.5/py-2.5) caused every funnel row to micro-shift when loading
 * resolved (JOV-4158 / #13819).
 */
export const FUNNEL_STAGE_OUTER_CLASS = 'space-y-1.5 px-3.5 py-2.5';
/** min-h-4 reserves space for text-mid value (0.9375rem) so skeleton → loaded is height-stable */
export const FUNNEL_STAGE_METRIC_ROW_CLASS =
  'flex min-h-4 items-center justify-between gap-2';

/** Single stage in the vertical funnel waterfall */
export function FunnelStage({
  label,
  value,
  rate,
  barPercent,
  barIndex,
  loading,
}: {
  readonly label: string;
  readonly value: number;
  readonly rate: string | null;
  readonly barPercent: number;
  readonly barIndex: number;
  readonly loading: boolean;
}) {
  if (loading) {
    return (
      <div className={FUNNEL_STAGE_OUTER_CLASS}>
        <div className={FUNNEL_STAGE_METRIC_ROW_CLASS}>
          <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
          <LoadingSkeleton height='h-4' width='w-12' rounded='sm' />
        </div>
        <div className={cn('h-1.5 rounded-full', TRACK_BG, 'animate-pulse')} />
      </div>
    );
  }

  return (
    <div className={FUNNEL_STAGE_OUTER_CLASS}>
      <div className={FUNNEL_STAGE_METRIC_ROW_CLASS}>
        <span className='text-xs font-caption text-secondary-token'>
          {label}
        </span>
        <span className='flex min-h-4 items-center gap-1.5'>
          <span className='tabular-nums text-mid font-semibold leading-none tracking-tighter text-primary-token'>
            {numberFormatter.format(value)}
          </span>
          <span
            data-funnel-rate
            className='w-8 text-right tabular-nums text-3xs font-caption text-tertiary-token'
          >
            {rate}
          </span>
        </span>
      </div>
      <div className={cn('h-1.5 rounded-full', TRACK_BG)}>
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-cinematic ease-out',
            BAR_OPACITY[barIndex] ?? BAR_OPACITY.at(-1)
          )}
          style={{ width: `${value > 0 ? Math.max(barPercent, 2) : 0}%` }}
        />
      </div>
    </div>
  );
}

/** Vertical waterfall funnel card — Views → Visitors → Subscribers */
function FunnelCard({
  stages,
  loading,
}: {
  readonly stages: readonly { label: string; value: number }[];
  readonly loading: boolean;
}) {
  const maxValue = stages[0]?.value ?? 0;

  return (
    <DrawerSurfaceCard
      variant='card'
      data-right-rail-section='status'
      className='divide-y divide-subtle overflow-hidden py-1'
    >
      {stages.map((stage, index) => {
        const barPercent = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
        const rate =
          index > 0
            ? calculateConversionRate(stage.value, stages[0].value)
            : null;

        return (
          <FunnelStage
            key={stage.label}
            label={stage.label}
            value={stage.value}
            rate={rate}
            barPercent={barPercent}
            barIndex={index}
            loading={loading}
          />
        );
      })}
    </DrawerSurfaceCard>
  );
}

export interface AnalyticsSidebarProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export interface AnalyticsSidebarViewProps extends AnalyticsSidebarProps {
  readonly data: DashboardAnalyticsResponse | null | undefined;
  readonly loading: boolean;
  readonly isFetching?: boolean;
  readonly range: AnalyticsRange;
  /** Omit to hide the range control (static demo rails have one window). */
  readonly onRangeChange?: (range: AnalyticsRange) => void;
  /** Set only when the fetch failed; with no data the rail shows the error state. */
  readonly onRetry?: () => void;
  readonly activeTab: AnalyticsTab;
  readonly onActiveTabChange: (tab: AnalyticsTab) => void;
  readonly testId?: string;
  readonly tabbedCardTestId?: string;
}

export function AnalyticsSidebarView({
  isOpen,
  onClose,
  data,
  loading,
  isFetching = false,
  range,
  onRangeChange,
  onRetry,
  activeTab,
  onActiveTabChange,
  testId = 'analytics-sidebar',
  tabbedCardTestId = 'analytics-sidebar-tabbed-card',
}: AnalyticsSidebarViewProps) {
  const showTipLinkVisits = (data?.tip_link_visits ?? 0) > 0;
  // A failed fetch has no data, so it must never read as "no visits yet".
  const showError = !loading && onRetry != null && data == null;
  const isEmpty = !loading && data != null && !hasAudienceActivity(data);
  const hideMetrics = showError || isEmpty;
  const stages = [
    {
      label: CANONICAL_METRICS.profile_views.label,
      value: data?.profile_views ?? 0,
    },
    {
      label: CANONICAL_METRICS.unique_users.label,
      value: data?.unique_users ?? 0,
    },
    { label: 'Subscribers', value: data?.subscribers ?? 0 },
  ];

  return (
    <EntityTabbedRail
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel='Analytics'
      title='Analytics'
      hideMinimalHeaderBar
      testId={testId}
      activeTab={activeTab}
      onTabChange={onActiveTabChange}
      tabOptions={ANALYTICS_TAB_OPTIONS}
      tabsAriaLabel='Analytics data tabs'
      tabDistribution='fill'
      tabbedCardTestId={tabbedCardTestId}
      tabbedSurfaceVariant='card'
      hideTabbedCard={hideMetrics}
      sectionKind='details'
      contentClassName='pt-2'
      entityHeader={
        <div className='space-y-2 p-2.5'>
          <div className='relative px-1 py-1'>
            <div className='absolute right-2.5 top-2.5'>
              <DrawerHeaderActions
                primaryActions={[]}
                overflowActions={[]}
                onClose={onClose}
              />
            </div>
            <div className='space-y-3 pr-8'>
              <div className='space-y-1'>
                <p className='whitespace-nowrap text-mid font-semibold tracking-[-0.016em] text-primary-token'>
                  Audience funnel
                </p>
                <p className='text-xs leading-4 text-secondary-token'>
                  Views, clicks, and top traffic sources.
                </p>
              </div>
              {onRangeChange ? (
                <TimeRangeSelector
                  value={range}
                  onValueChange={onRangeChange}
                  ranges={RANGE_VALUES}
                  className='w-full'
                  triggerClassName='flex-1'
                  ariaLabel='Analytics Time Range'
                />
              ) : (
                <div aria-hidden='true' className='h-7 invisible' />
              )}
            </div>
          </div>

          <div
            className={cn(
              'space-y-2 transition-opacity duration-subtle',
              isFetching && !loading && 'opacity-70'
            )}
            data-right-rail-section='status'
          >
            {/* A failed fetch must never read as "no visits yet"; a first
                look shows one empty state instead of a funnel of zeros. */}
            {hideMetrics ? (
              <EmptyState
                variant={showError ? 'error' : undefined}
                icon={
                  showError ? undefined : (
                    <ChartColumn className='h-5 w-5' strokeWidth={1.75} />
                  )
                }
                heading={
                  showError ? 'Analytics Did Not Load' : 'No Profile Visits Yet'
                }
                description={
                  showError ? undefined : describeNoAudienceActivity(range)
                }
                action={
                  showError
                    ? { label: 'Retry', onClick: onRetry }
                    : {
                        label: 'Share Your Profile',
                        href: APP_ROUTES.CHAT_PROFILE_PANEL,
                      }
                }
                className='min-h-80'
                testId={`analytics-rail-${showError ? 'error' : 'empty'}-state`}
              />
            ) : null}
            {/* Funnel waterfall — vertical bars show dropoff at a glance */}
            {hideMetrics ? null : (
              <FunnelCard stages={stages} loading={loading} />
            )}

            {/* Engagement — compact 2-col, secondary to the funnel */}
            {hideMetrics ? null : (
              <DrawerStatGrid
                variant='flush'
                className={cn(
                  'gap-1 divide-x-0 border-t border-subtle pt-2',
                  showTipLinkVisits ? 'grid-cols-3' : 'grid-cols-2'
                )}
              >
                <div className='rounded-lg px-2 py-2'>
                  <StatTile
                    label='Link Clicks'
                    state={loading ? 'loading' : undefined}
                    value={formatMetricValue(loading, data?.total_clicks)}
                  />
                </div>
                <div className='rounded-lg px-2 py-2'>
                  <StatTile
                    label='Listen Clicks'
                    state={loading ? 'loading' : undefined}
                    value={formatMetricValue(loading, data?.listen_clicks)}
                  />
                </div>
                {showTipLinkVisits ? (
                  <div className='rounded-lg px-2 py-2'>
                    <StatTile
                      label='Tip Link Visits'
                      state={loading ? 'loading' : undefined}
                      value={formatMetricValue(loading, data?.tip_link_visits)}
                    />
                  </div>
                ) : null}
              </DrawerStatGrid>
            )}
          </div>
        </div>
      }
    >
      <RankedList
        icon={RANKED_TAB_ICONS[activeTab]}
        loading={loading}
        items={rankedRows(data, activeTab)
          .slice(0, 5)
          .map(([key, label, count]) => ({
            key,
            label,
            value: numberFormatter.format(count),
          }))}
        emptyMessage={RANKED_TAB_EMPTY[activeTab]}
        emptyState={
          activeTab === 'cities'
            ? {
                description:
                  'Cities appear as visitors with a known location open your profile.',
                action: data?.top_countries?.length
                  ? {
                      label: 'View Countries',
                      onClick: () => onActiveTabChange('countries'),
                    }
                  : undefined,
              }
            : undefined
        }
      />
    </EntityTabbedRail>
  );
}

export function AnalyticsSidebar({ isOpen, onClose }: AnalyticsSidebarProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('cities');

  const { data, isPending, isFetching, isError, refetch } =
    useDashboardAnalyticsQuery({
      range,
      view: 'full',
      enabled: true,
    });

  return (
    <AnalyticsSidebarView
      isOpen={isOpen}
      onClose={onClose}
      data={data}
      // isPending, not isLoading: a fetch paused offline has no data and must
      // show the skeleton, not zeros. Disabled queries never reach this rail.
      loading={isPending}
      isFetching={isFetching}
      onRetry={isError ? refetch : undefined}
      range={range}
      onRangeChange={setRange}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
    />
  );
}

export function StaticAnalyticsSidebar({
  isOpen,
  onClose,
  data,
  testId = 'demo-analytics-sidebar',
  tabbedCardTestId = 'demo-analytics-tabbed-card',
}: AnalyticsSidebarProps & {
  readonly data: DashboardAnalyticsResponse;
  readonly testId?: string;
  readonly tabbedCardTestId?: string;
}) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('cities');

  return (
    <AnalyticsSidebarView
      isOpen={isOpen}
      onClose={onClose}
      data={data}
      loading={false}
      range='30d'
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      testId={testId}
      tabbedCardTestId={tabbedCardTestId}
    />
  );
}
