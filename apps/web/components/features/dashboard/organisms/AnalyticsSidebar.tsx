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
export function calculateConversionRate(
  current: number,
  previous: number
): string | null {
  return formatAnalyticsStageRate(current, previous);
}

const RANGE_VALUES: readonly AnalyticsRange[] = ['7d', '30d'];

export type AnalyticsTab = 'cities' | 'countries' | 'sources' | 'links';

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
          {rate ? (
            <span className='tabular-nums text-3xs font-caption text-tertiary-token'>
              {rate}
            </span>
          ) : null}
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
  readonly onRangeChange: (range: AnalyticsRange) => void;
  readonly showRangeControl?: boolean;
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
  showRangeControl = true,
  activeTab,
  onActiveTabChange,
  testId = 'analytics-sidebar',
  tabbedCardTestId = 'analytics-sidebar-tabbed-card',
}: AnalyticsSidebarViewProps) {
  const showTipLinkVisits = (data?.tip_link_visits ?? 0) > 0;
  const isEmpty = !loading && !hasAudienceActivity(data);
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
      hideTabbedCard={isEmpty}
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
              {showRangeControl ? (
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
            {/* First look: one empty state instead of a funnel of zeros */}
            {isEmpty ? (
              <EmptyState
                icon={<ChartColumn className='h-5 w-5' strokeWidth={1.75} />}
                heading='No Profile Visits Yet'
                description={describeNoAudienceActivity(range)}
                action={{
                  label: 'Share Your Profile',
                  href: APP_ROUTES.CHAT_PROFILE_PANEL,
                }}
                className='min-h-80'
                testId='analytics-rail-empty-state'
              />
            ) : null}
            {/* Funnel waterfall — vertical bars show dropoff at a glance */}
            {isEmpty ? null : <FunnelCard stages={stages} loading={loading} />}

            {/* Engagement — compact 2-col, secondary to the funnel */}
            {isEmpty ? null : (
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
    </EntityTabbedRail>
  );
}

export function AnalyticsSidebar({ isOpen, onClose }: AnalyticsSidebarProps) {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('cities');

  const { data, isLoading, isFetching } = useDashboardAnalyticsQuery({
    range,
    view: 'full',
    enabled: true,
  });

  return (
    <AnalyticsSidebarView
      isOpen={isOpen}
      onClose={onClose}
      data={data}
      loading={isLoading}
      isFetching={isFetching}
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
      onRangeChange={() => {}}
      showRangeControl={false}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      testId={testId}
      tabbedCardTestId={tabbedCardTestId}
    />
  );
}
