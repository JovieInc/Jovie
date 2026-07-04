'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { formatPercent, formatUsd } from '@/lib/admin/format';
import type {
  FounderFunnelData,
  FounderFunnelStage,
  FounderFunnelTimeRange,
} from '@/lib/admin/founder-funnel';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { cn } from '@/lib/utils';

const RANGE_OPTIONS: ReadonlyArray<{
  value: FounderFunnelTimeRange;
  label: string;
}> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All time' },
];

const HERO_VALUE_CLASS =
  'text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-3xl';

async function fetchFounderFunnel(
  range: FounderFunnelTimeRange,
  signal: AbortSignal
): Promise<FounderFunnelData> {
  const response = await fetch(`/api/admin/hud/founder-funnel?range=${range}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as FounderFunnelData;
}

async function fetchShippingVelocity(
  signal: AbortSignal
): Promise<ShippingVelocityResponse> {
  const response = await fetch('/api/admin/hud/shipping-velocity?range=30d', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as ShippingVelocityResponse;
}

function sumMerged(buckets: readonly DailyBucket[]): number {
  return buckets.reduce((total, bucket) => total + bucket.merged, 0);
}

function formatMergesPerDay(buckets: readonly DailyBucket[]): string {
  const last7 = buckets.slice(-7);
  if (last7.length === 0) return '—';
  const perDay = sumMerged(last7) / last7.length;
  return perDay.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function RangeSelector({
  value,
  onChange,
}: Readonly<{
  readonly value: FounderFunnelTimeRange;
  readonly onChange: (range: FounderFunnelTimeRange) => void;
}>) {
  return (
    <div
      className='flex items-center gap-1'
      role='tablist'
      aria-label='Funnel time range'
    >
      {RANGE_OPTIONS.map(option => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type='button'
            role='tab'
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-surface-2 text-primary-token'
                : 'text-tertiary-token hover:text-secondary-token'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function StageConnector({
  stage,
  isBiggestLeak,
}: Readonly<{
  readonly stage: FounderFunnelStage;
  readonly isBiggestLeak: boolean;
}>) {
  return (
    <div
      className='flex shrink-0 flex-col items-center justify-center px-0.5'
      aria-hidden='true'
    >
      <span
        className={cn(
          'text-xs font-medium tabular-nums',
          isBiggestLeak ? 'text-error' : 'text-tertiary-token'
        )}
      >
        {stage.conversionRate === null
          ? '—'
          : formatPercent(stage.conversionRate)}
      </span>
      <span
        className={cn(
          'text-sm leading-none',
          isBiggestLeak ? 'text-error' : 'text-tertiary-token'
        )}
      >
        →
      </span>
    </div>
  );
}

function FunnelStageTile({
  stage,
  isBiggestLeak,
}: Readonly<{
  readonly stage: FounderFunnelStage;
  readonly isBiggestLeak: boolean;
}>) {
  return (
    <div
      className={cn(
        'min-w-32 shrink-0 rounded-(--radius-md) border p-2.5',
        isBiggestLeak ? 'border-error' : 'border-transparent'
      )}
      data-testid={`founder-funnel-stage-${stage.key}`}
      title={stage.description}
    >
      <p className='text-2xs font-semibold text-tertiary-token'>
        {stage.label}
      </p>
      <p className='mt-0.5 text-2xl font-semibold leading-none tracking-tight text-primary-token tabular-nums'>
        {stage.count.toLocaleString('en-US')}
      </p>
      <p
        className={cn(
          'mt-1 text-xs',
          isBiggestLeak ? 'font-medium text-error' : 'text-tertiary-token'
        )}
      >
        {isBiggestLeak && stage.dropOff !== null
          ? `Biggest drop-off · −${stage.dropOff.toLocaleString('en-US')}`
          : stage.dropOff === null
            ? 'Top of funnel'
            : `−${stage.dropOff.toLocaleString('en-US')} lost`}
      </p>
    </div>
  );
}

function FunnelFlow({
  funnel,
}: Readonly<{ readonly funnel: FounderFunnelData }>) {
  const isEmpty = funnel.stages.every(stage => stage.count === 0);

  if (isEmpty) {
    return <p className='text-app text-secondary-token'>No funnel data yet</p>;
  }

  return (
    <ul className='flex items-stretch gap-1 overflow-x-auto'>
      {funnel.stages.map((stage, i) => {
        const isBiggestLeak = stage.key === funnel.biggestDropOffKey;
        return (
          <li key={stage.key} className='flex list-none items-center'>
            {i > 0 ? (
              <StageConnector stage={stage} isBiggestLeak={isBiggestLeak} />
            ) : null}
            <FunnelStageTile stage={stage} isBiggestLeak={isBiggestLeak} />
          </li>
        );
      })}
    </ul>
  );
}

function FunnelFlowSkeleton() {
  return (
    <div className='flex gap-3'>
      {['chats', 'accounts', 'claimed', 'onboarded', 'paid'].map(key => (
        <div key={key} className='min-w-32 p-2.5'>
          <div className='h-3 w-20 animate-pulse rounded bg-surface-1' />
          <div className='mt-1 h-6 w-14 animate-pulse rounded bg-surface-1' />
          <div className='mt-1 h-3 w-16 animate-pulse rounded bg-surface-1' />
        </div>
      ))}
    </div>
  );
}

/**
 * Founder conversion HUD (#11500): the visitor→pay funnel flowchart,
 * topped by MRR + shipping velocity (merges/day).
 *
 * MRR arrives as a prop from the server (same `getAdminFunnelMetrics`
 * source as the admin hero — no new MRR source). Shipping velocity reuses
 * the existing /api/admin/hud/shipping-velocity route (shared query key
 * with HudKpiSubgrid so the ops HUD and overview share one fetch).
 */
export function FounderConversionHud({
  mrrUsd,
  initialFunnel,
}: Readonly<{
  /** Current MRR in USD, or null when Stripe data is unavailable */
  readonly mrrUsd: number | null;
  readonly initialFunnel: FounderFunnelData;
}>) {
  const [range, setRange] = useState<FounderFunnelTimeRange>(
    initialFunnel.timeRange
  );

  const funnelQuery = useQuery({
    queryKey: ['hud', 'founder-funnel', range],
    queryFn: ({ signal }) => fetchFounderFunnel(range, signal),
    ...FREQUENT_CACHE,
    initialData: range === initialFunnel.timeRange ? initialFunnel : undefined,
  });

  const velocityQuery = useQuery({
    queryKey: ['hud', 'kpi', 'shipping-velocity', '30d'],
    queryFn: ({ signal }) => fetchShippingVelocity(signal),
    ...FREQUENT_CACHE,
  });

  const funnel = funnelQuery.data;
  const mergesPerDay = velocityQuery.data
    ? formatMergesPerDay(velocityQuery.data.data)
    : '—';

  return (
    <div className='space-y-4' data-testid='founder-conversion-hud'>
      {/* Header strip: MRR + shipping velocity */}
      <div className='grid gap-4 sm:grid-cols-2'>
        <ContentMetricCard
          label='MRR'
          value={mrrUsd === null ? '—' : formatUsd(mrrUsd)}
          subtitle='Monthly recurring revenue'
          valueClassName={HERO_VALUE_CLASS}
          data-testid='founder-hud-mrr'
        />
        <ContentMetricCard
          label='Shipping velocity'
          value={mergesPerDay === '—' ? '—' : `${mergesPerDay}/day`}
          subtitle='PRs merged per day, avg last 7 days'
          valueClassName={HERO_VALUE_CLASS}
          data-testid='founder-hud-shipping-velocity'
        />
      </div>

      {/* Funnel flowchart */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Conversion funnel'
          subtitle='Onboarding chat → account → profile → onboarded → paid'
          density='compact'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
          actions={<RangeSelector value={range} onChange={setRange} />}
        />
        <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          {funnel ? (
            <>
              {funnel.errors.length > 0 ? (
                <p className='mb-2 text-xs text-error'>
                  {funnel.errors.join('; ')}
                </p>
              ) : null}
              <FunnelFlow funnel={funnel} />
            </>
          ) : funnelQuery.isError ? (
            <p className='text-xs text-error'>Failed to load funnel data</p>
          ) : (
            <FunnelFlowSkeleton />
          )}
        </div>
      </ContentSurfaceCard>
    </div>
  );
}

export function FounderConversionHudSkeleton() {
  return (
    <div className='space-y-4' data-testid='founder-conversion-hud-skeleton'>
      <div className='grid gap-4 sm:grid-cols-2'>
        {['mrr', 'velocity'].map(key => (
          <div key={key} className='rounded-(--radius-md) p-3.5'>
            <div className='h-3 w-24 animate-pulse rounded bg-surface-1' />
            <div className='mt-1.5 h-8 w-28 animate-pulse rounded bg-surface-1' />
          </div>
        ))}
      </div>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-36'
          descriptionWidth='w-64'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <FunnelFlowSkeleton />
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
