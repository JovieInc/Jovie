'use client';

import { Globe, Link2, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { DashboardRefreshButton } from '@/components/dashboard/molecules/DashboardRefreshButton';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { usePlanGate } from '@/lib/queries/usePlanGate';
import { captureException } from '@/lib/sentry/client-lite';
import { RangeToggle } from './RangeToggle';
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
/*  Stat card — compact metric with optional meta line                */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  meta,
  loading,
}: {
  readonly label: string;
  readonly value: string;
  readonly meta?: string;
  readonly loading?: boolean;
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
    <ContentSurfaceCard className='p-4 lg:p-5'>
      <p className='text-[13px] text-secondary-token'>{label}</p>
      <p className='mt-1 text-2xl font-[590] tracking-[-0.011em] text-primary-token tabular-nums'>
        {value}
      </p>
      {meta && (
        <p className='mt-1 text-[11px] text-tertiary-token tabular-nums'>
          {meta}
        </p>
      )}
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
        <h3 className='text-[13px] font-[510] text-secondary-token'>{title}</h3>
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
                <span className='text-[11px] font-[510] text-tertiary-token w-4 tabular-nums'>
                  {index + 1}
                </span>
                <span className='text-[13px] text-secondary-token group-hover:text-primary-token transition-colors truncate'>
                  {item.label}
                </span>
              </div>
              <span className='text-[13px] font-[510] text-primary-token tabular-nums ml-2'>
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!loading && items.length === 0 && (
        <p className='text-[13px] text-tertiary-token py-4 text-center'>
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

  return (
    <div className='max-w-5xl space-y-8'>
      <h1 className='sr-only'>Analytics</h1>

      {/* Header */}
      <div className='flex items-center justify-between'>
        <p className='text-[13px] text-secondary-token'>{rangeLabel}</p>
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
          <RangeToggle
            value={range}
            onChange={setRange}
            tabsBaseId={rangeTabsBaseId}
            panelId={rangePanelId}
            maxRetentionDays={analyticsRetentionDays}
          />
        </div>
      </div>

      <div
        id={rangePanelId}
        role='tabpanel'
        aria-labelledby={activeRangeTabId}
        className='space-y-6'
      >
        {/* Primary metrics — conversion funnel as stat cards */}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          <StatCard
            label='Profile Views'
            value={fmt.format(data?.profile_views ?? 0)}
            meta='Total page visits'
            loading={loading}
          />
          <StatCard
            label='Unique Visitors'
            value={fmt.format(data?.unique_users ?? 0)}
            meta={
              (data?.profile_views ?? 0) > 0
                ? `${Math.round(((data?.unique_users ?? 0) / (data?.profile_views ?? 1)) * 100)}% of views`
                : undefined
            }
            loading={loading}
          />
          <StatCard
            label='Followers'
            value={fmt.format(data?.subscribers ?? 0)}
            meta={
              (data?.unique_users ?? 0) > 0
                ? `${Math.round(((data?.subscribers ?? 0) / (data?.unique_users ?? 1)) * 100)}% conversion`
                : undefined
            }
            loading={loading}
          />
        </div>

        {/* Secondary metrics */}
        {!loading &&
          typeof data?.listen_clicks === 'number' &&
          typeof data?.identified_users === 'number' && (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              <StatCard
                label='Capture Rate'
                value={`${data.capture_rate ?? 0}%`}
                meta='Visitors to followers'
              />
              <StatCard
                label='Listen Clicks'
                value={fmt.format(data.listen_clicks)}
              />
              <StatCard
                label='Identified Users'
                value={fmt.format(data.identified_users)}
              />
              <StatCard
                label='Total Clicks'
                value={fmt.format(data.total_clicks ?? 0)}
                meta='All time'
              />
            </div>
          )}

        {error && (
          <ContentSurfaceCard className='px-4 py-3 text-center'>
            <p className='text-[13px] text-destructive'>{error}</p>
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
