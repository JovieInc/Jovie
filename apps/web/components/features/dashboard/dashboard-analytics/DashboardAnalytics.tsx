'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { Globe, HelpCircle, Link2, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { TimeRangeSelector } from '@/components/molecules/TimeRangeSelector';
import { DashboardRefreshButton } from '@/features/dashboard/molecules/DashboardRefreshButton';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import {
  type DashboardMetricKey,
  getContradictoryMetrics,
  isMetricEmpty,
  METRIC_DEFINITIONS,
  METRIC_EMPTY_LABELS,
} from '@/lib/analytics/metric-definitions';
import { usePlanGate } from '@/lib/queries';
import { captureException } from '@/lib/sentry/client-lite';
import { cn } from '@/lib/utils';
import { ANALYTICS_PAGE_RANGES } from './types';
import { useDashboardAnalyticsState } from './useDashboardAnalytics';

const numberFormatter = new Intl.NumberFormat();
const LOADING_SKELETON_COUNT = 5;
const LOADING_SKELETON_KEYS = Array.from(
  { length: LOADING_SKELETON_COUNT },
  (_, i) => `loading-${i}`
);

function formatLinkType(linkType: string): string {
  const typeMap: Record<string, string> = {
    listen: 'Listen Link',
    social: 'Social Link',
    other: 'Other Link',
  };
  return typeMap[linkType] || linkType;
}

/* ------------------------------------------------------------------ */
/*  Stat card — compact metric with definition tooltip                 */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  meta,
  definition,
  loading,
  suspect,
  'data-testid': testId,
}: {
  readonly label: string;
  readonly value: string;
  readonly meta?: string;
  /** One-line definition shown in tooltip. */
  readonly definition?: string;
  readonly loading?: boolean;
  /** When true, value is contradictory — show a safe placeholder instead. */
  readonly suspect?: boolean;
  readonly 'data-testid'?: string;
}) {
  if (loading) {
    return (
      <ContentSurfaceCard className='p-4 lg:p-5'>
        <LoadingSkeleton
          height='h-3'
          width='w-20'
          rounded='sm'
          className='mb-3'
        />
        <LoadingSkeleton height='h-7' width='w-16' rounded='sm' />
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className='p-4 lg:p-5' data-testid={testId}>
      <div className='flex items-center gap-1'>
        <p className='text-app text-secondary-token'>{label}</p>
        {definition ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                className='text-tertiary-token transition-colors hover:text-secondary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                aria-label={`About ${label}`}
              >
                <HelpCircle className='h-3 w-3' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='top' className='max-w-50'>
              <p className='text-app'>{definition}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {suspect ? (
        <p
          className='mt-1 text-2xl font-semibold tracking-[-0.011em] text-tertiary-token'
          title='Value may be inaccurate'
          data-testid={testId ? `${testId}-suspect` : undefined}
        >
          —
        </p>
      ) : (
        <p className='mt-1 text-2xl font-semibold tracking-[-0.011em] text-primary-token tabular-nums'>
          {value}
        </p>
      )}
      {!suspect && meta ? (
        <p className='mt-1 text-2xs text-tertiary-token tabular-nums'>{meta}</p>
      ) : null}
    </ContentSurfaceCard>
  );
}

/* ------------------------------------------------------------------ */
/*  List section — ranked list inside a card                          */
/* ------------------------------------------------------------------ */

interface ListItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

function ListSection({
  title,
  icon: Icon,
  loading,
  items,
  emptyMessage,
}: {
  readonly title: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly loading: boolean;
  readonly items: readonly ListItem[];
  readonly emptyMessage: string;
}) {
  return (
    <ContentSurfaceCard className='p-4 lg:p-5'>
      <div className='mb-3 flex items-center gap-2'>
        <Icon className='h-4 w-4 text-tertiary-token' />
        <h3 className='text-app font-caption text-secondary-token'>{title}</h3>
      </div>

      {loading && (
        <ul className='space-y-3' aria-hidden='true'>
          {LOADING_SKELETON_KEYS.map(key => (
            <li key={key} className='flex items-center justify-between'>
              <LoadingSkeleton height='h-4' width='w-28' rounded='sm' />
              <LoadingSkeleton height='h-4' width='w-10' rounded='sm' />
            </li>
          ))}
        </ul>
      )}
      {!loading && items.length > 0 && (
        <ul className='space-y-3'>
          {items.map((item, index) => (
            <li
              key={item.key}
              className='flex items-center justify-between group'
            >
              <div className='flex items-center gap-2 min-w-0 flex-1'>
                <span className='w-4 text-2xs font-caption text-tertiary-token tabular-nums'>
                  {index + 1}
                </span>
                <span className='truncate text-app text-secondary-token transition-colors group-hover:text-primary-token'>
                  {item.label}
                </span>
              </div>
              <span className='ml-2 text-app font-caption text-primary-token tabular-nums'>
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!loading && items.length === 0 && (
        <p className='py-4 text-center text-app text-tertiary-token'>
          {emptyMessage}
        </p>
      )}
    </ContentSurfaceCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Main analytics dashboard                                          */
/* ------------------------------------------------------------------ */

export function DashboardAnalytics() {
  const router = useRouter();
  const {
    artist,
    range,
    setRange,
    rangeTabsBaseId,
    rangePanelId,
    activeRangeTabId,
    data,
    error,
    loading,
    refresh,
    rangeLabel,
  } = useDashboardAnalyticsState();

  const { analyticsRetentionDays } = usePlanGate();

  if (!artist) {
    return (
      <PageErrorState message='Unable to load analytics. Your profile data is unavailable — please refresh the page.' />
    );
  }

  const fmt = numberFormatter;
  const showTipLinkVisits = (data?.tip_link_visits ?? 0) > 0;

  // Identify contradictory metric values so we can hide them safely.
  const contradictory: ReadonlySet<string> = loading
    ? new Set<DashboardMetricKey>()
    : getContradictoryMetrics({
        profile_views: data?.profile_views,
        unique_users: data?.unique_users,
        subscribers: data?.subscribers,
        listen_clicks: data?.listen_clicks,
        total_clicks: data?.total_clicks,
        identified_users: data?.identified_users,
        capture_rate: data?.capture_rate,
      });

  // Resolve display value: explicit empty label, or formatted number.
  // Returns '—' when data hasn't loaded yet (error/pre-fetch).
  function displayValue(
    key: Parameters<typeof isMetricEmpty>[0],
    rawValue: number | undefined
  ): string {
    if (!loading && data === undefined) return '—';
    if (!loading && isMetricEmpty(key, data ?? {})) {
      return METRIC_EMPTY_LABELS[key];
    }
    return fmt.format(rawValue ?? 0);
  }

  return (
    <div className='max-w-5xl space-y-8'>
      <h1 className='sr-only'>Analytics</h1>

      {/* Header */}
      <div className='flex items-center justify-between'>
        <p className='text-app text-secondary-token'>{rangeLabel}</p>
        <div className='flex items-center gap-2'>
          <DashboardRefreshButton
            ariaLabel='Refresh analytics'
            onRefresh={() => router.refresh()}
            onRefreshed={() => {
              refresh().catch(refreshError => {
                captureException(refreshError);
              });
            }}
          />
          <TimeRangeSelector
            variant='tabs'
            value={range}
            onValueChange={setRange}
            ranges={ANALYTICS_PAGE_RANGES}
            tabsBaseId={rangeTabsBaseId}
            panelId={rangePanelId}
            maxRetentionDays={analyticsRetentionDays ?? undefined}
          />
        </div>
      </div>

      <div
        id={rangePanelId}
        role='tabpanel'
        aria-labelledby={activeRangeTabId}
        className='space-y-6'
      >
        {/* Primary metrics — conversion funnel */}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          <StatCard
            label={METRIC_DEFINITIONS.profile_views.label}
            definition={METRIC_DEFINITIONS.profile_views.definition}
            value={displayValue('profile_views', data?.profile_views)}
            loading={loading}
            data-testid='stat-profile-views'
          />
          <StatCard
            label={METRIC_DEFINITIONS.unique_users.label}
            definition={METRIC_DEFINITIONS.unique_users.definition}
            value={displayValue('unique_users', data?.unique_users)}
            meta={
              !loading &&
              (data?.profile_views ?? 0) > 0 &&
              !contradictory.has('unique_users')
                ? `${Math.round(((data?.unique_users ?? 0) / (data?.profile_views ?? 1)) * 100)}% of views`
                : undefined
            }
            loading={loading}
            suspect={contradictory.has('unique_users')}
            data-testid='stat-unique-users'
          />
          <StatCard
            label={METRIC_DEFINITIONS.subscribers.label}
            definition={METRIC_DEFINITIONS.subscribers.definition}
            value={displayValue('subscribers', data?.subscribers)}
            meta={
              !loading &&
              (data?.unique_users ?? 0) > 0 &&
              !contradictory.has('subscribers')
                ? `${Math.round(((data?.subscribers ?? 0) / (data?.unique_users ?? 1)) * 100)}% conversion`
                : undefined
            }
            loading={loading}
            suspect={contradictory.has('subscribers')}
            data-testid='stat-subscribers'
          />
        </div>

        {/* Secondary metrics */}
        {!loading &&
          typeof data?.listen_clicks === 'number' &&
          typeof data?.identified_users === 'number' && (
            <div
              className={cn(
                'grid grid-cols-2 gap-3',
                showTipLinkVisits ? 'sm:grid-cols-5' : 'sm:grid-cols-4'
              )}
            >
              <StatCard
                label={METRIC_DEFINITIONS.capture_rate.label}
                definition={METRIC_DEFINITIONS.capture_rate.definition}
                value={
                  isMetricEmpty('capture_rate', data)
                    ? METRIC_EMPTY_LABELS.capture_rate
                    : `${data.capture_rate ?? 0}%`
                }
                suspect={contradictory.has('capture_rate')}
                data-testid='stat-capture-rate'
              />
              <StatCard
                label={METRIC_DEFINITIONS.listen_clicks.label}
                definition={METRIC_DEFINITIONS.listen_clicks.definition}
                value={displayValue('listen_clicks', data.listen_clicks)}
                suspect={contradictory.has('listen_clicks')}
                data-testid='stat-listen-clicks'
              />
              <StatCard
                label={METRIC_DEFINITIONS.identified_users.label}
                definition={METRIC_DEFINITIONS.identified_users.definition}
                value={displayValue('identified_users', data.identified_users)}
                suspect={contradictory.has('identified_users')}
                data-testid='stat-identified-users'
              />
              <StatCard
                label={METRIC_DEFINITIONS.total_clicks.label}
                definition={METRIC_DEFINITIONS.total_clicks.definition}
                value={displayValue('total_clicks', data.total_clicks)}
                data-testid='stat-total-clicks'
              />
              {showTipLinkVisits ? (
                <StatCard
                  label={METRIC_DEFINITIONS.tip_link_visits.label}
                  definition={METRIC_DEFINITIONS.tip_link_visits.definition}
                  value={displayValue('tip_link_visits', data.tip_link_visits)}
                  data-testid='stat-tip-link-visits'
                />
              ) : null}
            </div>
          )}

        {error && (
          <ContentSurfaceCard className='px-4 py-3 text-center'>
            <p className='text-app text-destructive'>{error}</p>
          </ContentSurfaceCard>
        )}

        {/* Lists */}
        <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
          <ListSection
            title='Top Cities'
            icon={MapPin}
            loading={loading}
            items={(data?.top_cities ?? []).map(c => ({
              key: c.city,
              label: c.city,
              value: fmt.format(c.count),
            }))}
            emptyMessage='No city data yet'
          />
          <ListSection
            title='Traffic Sources'
            icon={Globe}
            loading={loading}
            items={(data?.top_referrers ?? []).map(r => ({
              key: r.referrer || 'direct',
              label: r.referrer || 'Direct',
              value: fmt.format(r.count),
            }))}
            emptyMessage='No referrer data yet'
          />
          <ListSection
            title='Top Links'
            icon={Link2}
            loading={loading}
            items={(data?.top_links ?? []).map(link => ({
              key: link.id,
              label: formatLinkType(link.url),
              value: fmt.format(link.clicks),
            }))}
            emptyMessage='No link data yet'
          />
        </div>
      </div>
    </div>
  );
}
