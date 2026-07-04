'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { medianNumber } from '@/lib/hud/number-series';
import { isHudMetricValueAvailable } from '@/lib/hud/source-trust';
import type { HudTone } from '@/lib/hud/tone-determination';
import { FREQUENT_CACHE } from '@/lib/queries/cache-strategies';
import { getAccentCssVars, HUD_TONE_ACCENT } from '@/lib/ui/accent-palette';
import type { HudMetrics } from '@/types/hud';

const KPI_TILE_CLASS = 'rounded-(--radius-md) p-3 shadow-card-elevated';
const KPI_VALUE_CLASS =
  'text-2xl font-[620] leading-none tracking-[-0.03em] tabular-nums sm:text-3xl';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
}

function deltaPercent(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior) || prior === 0) {
    return null;
  }
  return ((current - prior) / prior) * 100;
}

function sumMerged(buckets: readonly DailyBucket[]): number {
  return buckets.reduce((total, bucket) => total + bucket.merged, 0);
}

function mergeP50Values(buckets: readonly DailyBucket[]): number[] {
  const values: number[] = [];
  for (const bucket of buckets) {
    const value = bucket.mergeP50Hours ?? null;
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  return values;
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

function Sparkline({
  values,
}: Readonly<{ readonly values: readonly number[] }>) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = 100 / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = 26 - ((value - min) / span) * 24;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox='0 0 100 28'
      preserveAspectRatio='none'
      className='mt-1.5 h-7 w-full'
      aria-hidden='true'
    >
      <title>Trend</title>
      <polyline
        points={points}
        fill='none'
        stroke='var(--color-accent)'
        strokeWidth='1.5'
        vectorEffect='non-scaling-stroke'
      />
    </svg>
  );
}

function DeltaLine({
  deltaPct,
  goodDirection,
}: Readonly<{
  readonly deltaPct: number | null;
  readonly goodDirection: 'up' | 'down';
}>) {
  if (deltaPct === null) {
    return (
      <span className='text-2xs text-tertiary-token'>{'—'} vs prior 7d</span>
    );
  }
  const isFlat = Math.abs(deltaPct) < 0.05;
  const isGood = goodDirection === 'up' ? deltaPct > 0 : deltaPct < 0;
  const tone: HudTone = getDeltaTone(isFlat, isGood);
  const accent = getAccentCssVars(HUD_TONE_ACCENT[tone]);
  const arrow = getDeltaArrow(isFlat, deltaPct);

  return (
    <span
      className='text-2xs font-medium tabular-nums'
      style={{
        color:
          tone === 'neutral'
            ? 'var(--color-text-secondary-token)'
            : accent.solid,
      }}
    >
      {arrow} {Math.abs(deltaPct).toFixed(1)}% vs prior 7d
    </span>
  );
}

function getDeltaTone(isFlat: boolean, isGood: boolean): HudTone {
  if (isFlat) return 'neutral';
  return isGood ? 'good' : 'bad';
}

function getDeltaArrow(isFlat: boolean, deltaPct: number): string {
  if (isFlat) return '→';
  return deltaPct > 0 ? '↑' : '↓';
}

function MetricSubtitle({
  children,
}: Readonly<{ readonly children: ReactNode }>) {
  return <div className='grid gap-1'>{children}</div>;
}

function KpiMetricCard({
  label,
  value,
  subtitle,
  testId,
}: Readonly<{
  readonly label: string;
  readonly value: string;
  readonly subtitle: ReactNode;
  readonly testId: string;
}>) {
  return (
    <ContentMetricCard
      label={label}
      value={value}
      subtitle={subtitle}
      className={KPI_TILE_CLASS}
      valueClassName={KPI_VALUE_CLASS}
      data-testid={testId}
    />
  );
}

/**
 * Dense 4-up KPI subgrid for the operator HUD (#12887): ship velocity,
 * PR merge time, cash, and active agents. Each tile keeps its existing
 * data source (shipping-velocity route, Mercury via HudMetrics, Hermes
 * aiOps counts) and stacks to one column below 768px.
 */
export function HudKpiSubgrid({
  metrics,
}: Readonly<{ readonly metrics: HudMetrics }>) {
  const velocityQuery = useQuery({
    queryKey: ['hud', 'kpi', 'shipping-velocity', '30d'],
    queryFn: ({ signal }) => fetchShippingVelocity(signal),
    ...FREQUENT_CACHE,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const buckets = velocityQuery.data?.data ?? [];
  const last7 = buckets.slice(-7);
  const prior7 = buckets.slice(-14, -7);

  const hasVelocityData = velocityQuery.data !== undefined;
  const mergedLast7 = sumMerged(last7);
  const velocityDelta = deltaPercent(mergedLast7, sumMerged(prior7));

  const mergeTimeLast7 = medianNumber(mergeP50Values(last7));
  const mergeTimePrior7 = medianNumber(mergeP50Values(prior7));
  const mergeTimeDelta =
    mergeTimeLast7 !== null && mergeTimePrior7 !== null
      ? deltaPercent(mergeTimeLast7, mergeTimePrior7)
      : null;
  const cashAvailable = isHudMetricValueAvailable(metrics.sources.mercury);
  const cards: Array<{
    label: string;
    value: string;
    subtitle: ReactNode;
    testId: string;
  }> = [
    {
      label: 'Ship velocity',
      value: hasVelocityData ? mergedLast7.toLocaleString('en-US') : '—',
      subtitle: (
        <MetricSubtitle>
          <span>PRs merged, last 7d</span>
          <DeltaLine deltaPct={velocityDelta} goodDirection='up' />
          <Sparkline values={buckets.map(bucket => bucket.merged)} />
        </MetricSubtitle>
      ),
      testId: 'hud-kpi-ship-velocity',
    },
    {
      label: 'PR merge time',
      value: hasVelocityData ? formatHours(mergeTimeLast7) : '—',
      subtitle: (
        <MetricSubtitle>
          <span>P50, last 7d</span>
          <DeltaLine deltaPct={mergeTimeDelta} goodDirection='down' />
          <Sparkline values={mergeP50Values(buckets)} />
        </MetricSubtitle>
      ),
      testId: 'hud-kpi-merge-time',
    },
    {
      label: 'Cash',
      value: cashAvailable ? formatUsd(metrics.overview.balanceUsd) : '—',
      subtitle: (
        <MetricSubtitle>
          <span className='tabular-nums'>
            {cashAvailable
              ? `Burn ${formatUsd(metrics.overview.burnRateUsd)} / 30d`
              : 'Mercury data unavailable'}
          </span>
          {cashAvailable && metrics.overview.runwayMonths !== null ? (
            <span className='tabular-nums'>
              Runway {metrics.overview.runwayMonths.toFixed(1)} mo
            </span>
          ) : null}
        </MetricSubtitle>
      ),
      testId: 'hud-kpi-cash',
    },
    {
      label: 'Active agents',
      value: metrics.aiOps.counts.running.toLocaleString('en-US'),
      subtitle: (
        <MetricSubtitle>
          <span className='tabular-nums'>
            Queued {metrics.aiOps.counts.queued.toLocaleString('en-US')} |
            Review {metrics.aiOps.counts.review.toLocaleString('en-US')}
          </span>
          <span className='tabular-nums'>
            {metrics.aiOps.mergeQueue.openAgentPrs} /{' '}
            {metrics.aiOps.mergeQueue.openAgentPrThreshold} agent PRs open
          </span>
        </MetricSubtitle>
      ),
      testId: 'hud-kpi-active-agents',
    },
  ];

  return (
    <div
      className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4'
      data-testid='hud-kpi-subgrid'
    >
      {cards.map(card => (
        <KpiMetricCard key={card.testId} {...card} />
      ))}
    </div>
  );
}
