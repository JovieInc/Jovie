'use client';

import { Globe, Link2, MapPin } from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import {
  DrawerStatGrid,
  DrawerSurfaceCard,
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
  StatTile,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
} from '@/types/analytics';

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
const BAR_OPACITY = ['bg-accent/15', 'bg-accent/10', 'bg-accent/6'] as const;

const TRACK_BG = 'bg-surface-2';

/** Single stage in the vertical funnel waterfall */
function FunnelStage({
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
      <div className='space-y-1.5 px-3 py-2'>
        <div className='flex items-center justify-between'>
          <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
          <LoadingSkeleton height='h-3' width='w-12' rounded='sm' />
        </div>
        <div className={cn('h-1.5 rounded-full', TRACK_BG, 'animate-pulse')} />
      </div>
    );
  }

  return (
    <div className='space-y-1.5 px-3 py-2'>
      <div className='flex items-baseline justify-between gap-2'>
        <span className='text-[11.5px] font-caption text-secondary-token'>
          {label}
        </span>
        <span className='flex items-baseline gap-1.5'>
          <span className='tabular-nums text-mid font-semibold leading-none tracking-[-0.02em] text-primary-token'>
            {numberFormatter.format(value)}
          </span>
          {rate && (
            <span className='tabular-nums text-3xs font-caption text-tertiary-token'>
              {rate}
            </span>
          )}
        </span>
      </div>
      <div className={cn('h-1.5 rounded-full', TRACK_BG)}>
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-out',
            BAR_OPACITY[barIndex] ?? BAR_OPACITY.at(-1)
          )}
          style={{ width: `${Math.max(barPercent, 2)}%` }}
        />
      </div>
    </div>
  );
}

/** Vertical waterfall funnel card — Views → Visitors → Followers */
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
            className='flex h-9 items-center justify-between rounded-lg px-2.5'
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
      <div className='flex min-h-[196px] flex-col items-center justify-center text-center'>
        <IconComponent className='mb-1.5 h-4 w-4 text-quaternary-token' />
        <p className='text-xs text-tertiary-token'>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className='min-h-[196px] space-y-0.5'>
      {items.map((item, index) => (
        <li
          key={item.key}
          className='group flex h-9 items-center justify-between rounded-lg px-2.5 transition-colors hover:bg-surface-1'
        >
          <div className='flex min-w-0 flex-1 items-center gap-1.5'>
            <span className='w-3 text-[11px] font-caption text-tertiary-token tabular-nums'>
              {index + 1}
            </span>
            <IconComponent className='h-3.5 w-3.5 text-tertiary-token' />
            <span className='truncate text-app text-secondary-token transition-colors group-hover:text-primary-token'>
              {item.label}
            </span>
          </div>
          <span className='ml-2 text-app font-semibold text-primary-token tabular-nums'>
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
  const stages = [
    { label: 'Profile Views', value: data?.profile_views ?? 0 },
    { label: 'Unique Visitors', value: data?.unique_users ?? 0 },
    { label: 'Followers', value: data?.subscribers ?? 0 },
  ];

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Analytics'
      data-testid={testId}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeader={
        <DrawerSurfaceCard variant='card' className='overflow-hidden'>
          <div className='relative p-3.5'>
            <div className='absolute right-2.5 top-2.5'>
              <DrawerHeaderActions
                primaryActions={[]}
                overflowActions={[]}
                onClose={onClose}
              />
            </div>
            <div className='flex items-start justify-between gap-3 pr-8'>
              <div className='space-y-0.5'>
                <p className='text-mid font-semibold tracking-[-0.016em] text-primary-token'>
                  Audience funnel
                </p>
                <p className='text-xs leading-[16px] text-secondary-token'>
                  Views, clicks, and top traffic sources.
                </p>
              </div>
              {showRangeControl ? (
                <AppSegmentControl
                  value={range}
                  onValueChange={onRangeChange}
                  options={RANGE_OPTIONS}
                  size='sm'
                  className='shrink-0'
                  aria-label='Analytics time range'
                />
              ) : null}
            </div>
          </div>
        </DrawerSurfaceCard>
      }
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col space-y-2 transition-opacity duration-150',
          isFetching && !loading && 'opacity-70'
        )}
      >
        <div className='shrink-0 space-y-2'>
          {/* Funnel waterfall — vertical bars show dropoff at a glance */}
          <FunnelCard stages={stages} loading={loading} />

          {/* Engagement — compact 2-col, secondary to the funnel */}
          <DrawerStatGrid variant='card'>
            <div className='px-3 py-2'>
              <StatTile
                label='Link Clicks'
                value={formatMetricValue(loading, data?.total_clicks)}
              />
            </div>
            <div className='px-3 py-2'>
              <StatTile
                label='Listen Clicks'
                value={formatMetricValue(loading, data?.listen_clicks)}
              />
            </div>
            {showTipLinkVisits ? (
              <div className='px-3 py-2'>
                <StatTile
                  label='Tip Link Visits'
                  value={formatMetricValue(loading, data?.tip_link_visits)}
                />
              </div>
            ) : null}
          </DrawerStatGrid>
        </div>
        <DrawerTabbedCard
          testId={tabbedCardTestId}
          tabs={
            <DrawerTabs
              value={activeTab}
              onValueChange={onActiveTabChange}
              options={ANALYTICS_TAB_OPTIONS}
              className='w-full'
              ariaLabel='Analytics data tabs'
              distribution='intrinsic'
            />
          }
          contentClassName='pt-2'
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
        </DrawerTabbedCard>
      </div>
    </EntitySidebarShell>
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
