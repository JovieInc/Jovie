'use client';

import { Button } from '@jovie/ui';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';
import type { HudObservationState } from '@/lib/hud/observation';
import { observationFromShippingVelocityBuckets } from '@/lib/hud/shipping-velocity-observation';

export type { DailyBucket };

type Range = '7d' | '30d' | '1y';

export interface ShippingVelocityChartProps {
  readonly initialData?: DailyBucket[];
  readonly initialRange?: Range;
  readonly cachedAt?: string;
}

const RANGE_OPTIONS: Array<{ value: Range; label: string }> = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '1y', label: '1Y' },
];

const SERIES_COLORS = {
  merged: 'var(--color-accent-blue)',
  opened: 'var(--color-accent-purple)',
  closed: 'var(--color-accent-gray)',
} as const;

const CHART_DOT_STROKE = 'var(--color-bg-surface-1)';
const CHART_CURSOR_STROKE = 'var(--color-border-subtle)';
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const AGE_TICK_INTERVAL_MS = 30 * 1000;

function cachedAtTimestamp(cachedAt: string | undefined): number | null {
  if (!cachedAt) return null;
  const timestamp = new Date(cachedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatCachedAgo(cachedTimestamp: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - cachedTimestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hr ago';
  return `${hours} hrs ago`;
}

function formatTooltipDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Skeleton lines to show while loading
const SKELETON_LINE_KEYS = ['skel-a', 'skel-b', 'skel-c'];

function ChartSkeleton() {
  return (
    <div className='h-50 w-full rounded-lg bg-surface-0' aria-hidden='true'>
      <svg
        role='img'
        aria-label='Loading Chart'
        width='100%'
        height='100%'
        viewBox='0 0 400 200'
        preserveAspectRatio='none'
      >
        {SKELETON_LINE_KEYS.map((key, index) => {
          const yOffset = 60 + index * 40;
          const amplitude = 15 - index * 4;
          const path = `M0,${yOffset} Q50,${yOffset - amplitude} 100,${yOffset} T200,${yOffset} T300,${yOffset} T400,${yOffset}`;
          return (
            <path
              key={key}
              d={path}
              stroke={
                index === 0
                  ? SERIES_COLORS.merged
                  : index === 1
                    ? SERIES_COLORS.opened
                    : SERIES_COLORS.closed
              }
              strokeWidth='1.5'
              fill='none'
              opacity='0.2'
            />
          );
        })}
      </svg>
    </div>
  );
}

interface CustomTooltipProps {
  readonly active?: boolean;
  readonly payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  readonly label?: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: Readonly<CustomTooltipProps>) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  const dateLabel = formatTooltipDate(label);
  const merged = payload.find(p => p.name === 'merged');
  const opened = payload.find(p => p.name === 'opened');
  const closed = payload.find(p => p.name === 'closed');

  const parts: string[] = [];
  if (merged && merged.value > 0) parts.push(`${merged.value} merged`);
  if (opened && opened.value > 0) parts.push(`${opened.value} opened`);
  if (closed && closed.value > 0) parts.push(`${closed.value} closed`);

  if (parts.length === 0) return null;

  return (
    <div className='rounded-lg border border-subtle bg-surface-1 px-3 py-2 shadow-card'>
      <p className='mb-1 text-2xs font-semibold text-secondary-token'>
        {dateLabel}
      </p>
      <p className='text-xs text-primary-token'>{parts.join(', ')}</p>
    </div>
  );
}

// The actual Recharts chart — lazy-loaded to keep bundle size down
const LazyVelocityChart = dynamic(
  () =>
    import('recharts').then(mod => {
      const { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } = mod;

      interface ChartDataPoint extends DailyBucket {
        label: string;
      }

      interface InnerChartProps {
        readonly data: DailyBucket[];
        readonly spotlight: string | null;
        readonly onLineClick: (series: string) => void;
        readonly onChartClick: () => void;
        readonly showClosed: boolean;
      }

      function getSeriesOpacity(
        seriesName: string,
        spotlight: string | null
      ): number {
        if (!spotlight) return 1;
        return spotlight === seriesName ? 1 : 0.15;
      }

      function RechartVelocityChart({
        data,
        spotlight,
        onLineClick,
        onChartClick,
        showClosed,
      }: Readonly<InnerChartProps>) {
        const formatted: ChartDataPoint[] = data.map(d => ({
          ...d,
          label: d.date,
        }));

        const mergedOpacity = getSeriesOpacity('merged', spotlight);
        const openedOpacity = getSeriesOpacity('opened', spotlight);
        const closedOpacity = getSeriesOpacity('closed', spotlight);

        return (
          <ResponsiveContainer width='100%' height={200}>
            <AreaChart
              data={formatted}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              onClick={onChartClick}
              accessibilityLayer={false}
            >
              <defs>
                <linearGradient id='mergedGradient' x1='0' y1='0' x2='0' y2='1'>
                  <stop
                    offset='5%'
                    stopColor={SERIES_COLORS.merged}
                    stopOpacity={0.08}
                  />
                  <stop
                    offset='95%'
                    stopColor={SERIES_COLORS.merged}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <XAxis
                dataKey='label'
                tick={false}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: CHART_CURSOR_STROKE, strokeWidth: 1 }}
              />

              {/* Merged PRs — hero series */}
              <Area
                type='monotone'
                dataKey='merged'
                stroke={SERIES_COLORS.merged}
                strokeWidth={2.5}
                fill='url(#mergedGradient)'
                dot={false}
                activeDot={{
                  r: 4,
                  fill: SERIES_COLORS.merged,
                  stroke: CHART_DOT_STROKE,
                  strokeWidth: 2,
                  onClick: () => onLineClick('merged'),
                }}
                opacity={mergedOpacity}
                onClick={() => onLineClick('merged')}
                style={{ cursor: 'pointer' }}
              />

              {/* Opened PRs — dashed comparison series */}
              <Area
                type='monotone'
                dataKey='opened'
                stroke={SERIES_COLORS.opened}
                strokeWidth={1.5}
                strokeDasharray='5 3'
                fill='none'
                dot={false}
                activeDot={{
                  r: 3,
                  fill: SERIES_COLORS.opened,
                  stroke: CHART_DOT_STROKE,
                  strokeWidth: 2,
                  onClick: () => onLineClick('opened'),
                }}
                opacity={openedOpacity * 0.55}
                onClick={() => onLineClick('opened')}
                style={{ cursor: 'pointer' }}
              />

              {/* Closed without merge — hidden by default */}
              {showClosed ? (
                <Area
                  type='monotone'
                  dataKey='closed'
                  stroke={SERIES_COLORS.closed}
                  strokeWidth={1.5}
                  strokeDasharray='2 3'
                  fill='none'
                  dot={false}
                  activeDot={{
                    r: 3,
                    fill: SERIES_COLORS.closed,
                    stroke: CHART_DOT_STROKE,
                    strokeWidth: 2,
                    onClick: () => onLineClick('closed'),
                  }}
                  opacity={closedOpacity}
                  onClick={() => onLineClick('closed')}
                  style={{ cursor: 'pointer' }}
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        );
      }

      return RechartVelocityChart;
    }),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export function ShippingVelocityChart({
  initialData,
  initialRange = '7d',
  cachedAt: initialCachedAt,
}: Readonly<ShippingVelocityChartProps>) {
  const [requestedRange, setRequestedRange] = useState<Range>(initialRange);
  const [displayedRange, setDisplayedRange] = useState<Range | null>(
    initialData ? initialRange : null
  );
  const [data, setData] = useState<DailyBucket[]>(initialData ?? []);
  const [cachedAt, setCachedAt] = useState<string | undefined>(initialCachedAt);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState<HudObservationState>(
    initialData
      ? observationFromShippingVelocityBuckets(initialData)
      : 'loading'
  );
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const titleId = useId();
  const summaryId = useId();
  const hasObservedRef = useRef(Boolean(initialData));
  const shouldSkipInitialFetchRef = useRef(Boolean(initialData));
  const requestSequenceRef = useRef(0);
  const activeRequestRef = useRef<{
    readonly controller: AbortController;
    readonly requestId: number;
  } | null>(null);
  const initialCachedTimestamp = cachedAtTimestamp(initialCachedAt);
  const lastRequestStartedAtRef = useRef<number | null>(
    initialData
      ? Math.min(Date.now(), initialCachedTimestamp ?? Date.now())
      : null
  );

  const fetchData = useCallback(async (rangeToFetch: Range) => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    activeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    activeRequestRef.current = { controller, requestId };
    lastRequestStartedAtRef.current = Date.now();

    if (!hasObservedRef.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const isActiveRequest = () =>
      activeRequestRef.current?.requestId === requestId &&
      !controller.signal.aborted;

    try {
      const response = await fetch(
        `/api/admin/hud/shipping-velocity?range=${rangeToFetch}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch (${response.status})`);
      }
      const result = (await response.json()) as ShippingVelocityResponse;
      if (!isActiveRequest()) return;
      if (result.range !== rangeToFetch) {
        throw new Error(
          `Received ${result.range} data while loading ${rangeToFetch}`
        );
      }
      setData(result.data);
      setCachedAt(result.cachedAt);
      setDisplayedRange(result.range);
      setError(result.errorMessage ?? null);
      setObservation(
        result.observation ??
          observationFromShippingVelocityBuckets(result.data)
      );
      hasObservedRef.current = true;
    } catch (err) {
      if (!isActiveRequest()) return;
      setError(
        err instanceof Error ? err.message : 'Could not load shipping data'
      );
      setObservation('unavailable');
    } finally {
      if (activeRequestRef.current?.requestId === requestId) {
        activeRequestRef.current = null;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Fetch when range changes (but not on initial mount if initialData is provided)
  useEffect(() => {
    if (shouldSkipInitialFetchRef.current) {
      shouldSkipInitialFetchRef.current = false;
      return;
    }
    fetchData(requestedRange).catch(() => {});
  }, [requestedRange, fetchData]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let ageTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const clearTimers = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (ageTimer) clearInterval(ageTimer);
      refreshTimer = null;
      ageTimer = null;
    };

    const scheduleRefresh = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      const now = Date.now();
      const lastStartedAt = lastRequestStartedAtRef.current;
      const elapsed =
        lastStartedAt === null ? REFRESH_INTERVAL_MS : now - lastStartedAt;
      const delay = Math.max(0, REFRESH_INTERVAL_MS - elapsed);

      refreshTimer = setTimeout(() => {
        if (disposed || document.visibilityState !== 'visible') return;
        fetchData(requestedRange).catch(() => {});
        scheduleRefresh();
      }, delay);
    };

    const activate = () => {
      clearTimers();
      if (disposed) return;
      if (document.visibilityState !== 'visible') {
        activeRequestRef.current?.controller.abort();
        return;
      }

      const now = Date.now();
      setNowMs(now);
      ageTimer = setInterval(() => setNowMs(Date.now()), AGE_TICK_INTERVAL_MS);

      const lastStartedAt = lastRequestStartedAtRef.current;
      const activeRequest = activeRequestRef.current;
      const needsInitialObservation =
        !hasObservedRef.current &&
        (activeRequest === null || activeRequest.controller.signal.aborted);
      if (
        needsInitialObservation ||
        (lastStartedAt !== null && now - lastStartedAt >= REFRESH_INTERVAL_MS)
      ) {
        fetchData(requestedRange).catch(() => {});
      }
      scheduleRefresh();
    };

    document.addEventListener('visibilitychange', activate);
    activate();

    return () => {
      disposed = true;
      clearTimers();
      document.removeEventListener('visibilitychange', activate);
    };
  }, [fetchData, requestedRange]);

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
    },
    []
  );

  function handleRangeChange(newRange: Range) {
    setRequestedRange(newRange);
    setSpotlight(null);
  }

  function handleLineClick(series: string) {
    setSpotlight(prev => (prev === series ? null : series));
  }

  function handleChartClick() {
    setSpotlight(null);
  }

  const handleRetry = () => {
    fetchData(requestedRange).catch(() => {});
  };
  const cachedTimestamp = cachedAtTimestamp(cachedAt);
  const isStale =
    cachedTimestamp !== null && nowMs - cachedTimestamp >= REFRESH_INTERVAL_MS;
  const freshnessLabel =
    cachedTimestamp === null ? null : formatCachedAgo(cachedTimestamp, nowMs);
  const retainedRangeMessage = displayedRange
    ? requestedRange === displayedRange
      ? `Showing last known ${displayedRange.toUpperCase()} velocity. ${error ?? 'Refresh failed.'}`
      : `Showing last known ${displayedRange.toUpperCase()} velocity. ${requestedRange.toUpperCase()} refresh failed. ${error ?? ''}`.trim()
    : (error ?? 'Shipping velocity is unavailable.');
  const showChart =
    observation !== 'not_configured' &&
    observation !== 'loading' &&
    !(observation === 'unavailable' && data.length === 0) &&
    observation !== 'empty';
  const totals = data.reduce(
    (sum, bucket) => ({
      merged: sum.merged + bucket.merged,
      opened: sum.opened + bucket.opened,
      closed: sum.closed + bucket.closed,
    }),
    { merged: 0, opened: 0, closed: 0 }
  );
  const accessibleSummary = `${displayedRange?.toUpperCase() ?? requestedRange.toUpperCase()} shipping velocity: ${totals.merged} merged, ${totals.opened} opened, and ${totals.closed} closed without merge.`;

  return (
    <div className='p-4'>
      {/* Header row */}
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <h3
            id={titleId}
            className='text-2xs font-semibold tracking-normal text-secondary-token'
          >
            Shipping Velocity
          </h3>
          {/* Legend */}
          <div className='flex items-center gap-2.5'>
            <Button
              type='button'
              variant='ghost'
              onClick={() => handleLineClick('merged')}
              className='h-auto flex items-center gap-1 opacity-80 transition-opacity hover:opacity-100 hover:bg-transparent'
              aria-label='Toggle Merged Series Spotlight'
              aria-pressed={spotlight === 'merged'}
            >
              <span
                className='block h-1 w-3 rounded-full'
                style={{ backgroundColor: SERIES_COLORS.merged }}
              />
              <span className='text-3xs text-tertiary-token'>Merged</span>
            </Button>
            <Button
              type='button'
              variant='ghost'
              onClick={() => handleLineClick('opened')}
              className='h-auto flex items-center gap-1 opacity-80 transition-opacity hover:opacity-100 hover:bg-transparent'
              aria-label='Toggle Opened Series Spotlight'
              aria-pressed={spotlight === 'opened'}
            >
              <span
                className='block h-1 w-3 rounded-full'
                style={{ backgroundColor: SERIES_COLORS.opened }}
              />
              <span className='text-3xs text-tertiary-token'>Opened</span>
            </Button>
            <Button
              type='button'
              variant='ghost'
              onClick={() => setShowClosed(prev => !prev)}
              className='h-auto flex items-center gap-1 transition-opacity hover:opacity-100 hover:bg-transparent'
              style={{ opacity: showClosed ? 0.8 : 0.4 }}
              aria-label='Toggle Closed Series Visibility'
              aria-pressed={showClosed}
            >
              <span
                className='block h-1 w-3 rounded-full'
                style={{ backgroundColor: SERIES_COLORS.closed }}
              />
              <span className='text-3xs text-tertiary-token'>Closed</span>
            </Button>
          </div>
        </div>

        {/* Range toggle */}
        <div className='flex items-center gap-0.5 rounded-lg border border-subtle bg-surface-0 p-0.5'>
          {RANGE_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => handleRangeChange(opt.value)}
              className={
                requestedRange === opt.value
                  ? 'h-auto rounded-md bg-surface-2 px-2.5 py-1 text-2xs font-semibold text-primary-token'
                  : 'h-auto rounded-md px-2.5 py-1 text-2xs font-medium text-tertiary-token transition-colors hover:text-secondary-token'
              }
              aria-pressed={requestedRange === opt.value}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {isLoading && data.length === 0 ? (
        <ChartSkeleton />
      ) : observation === 'not_configured' ? (
        <div className='flex h-50 items-center'>
          <HudObservationStatus
            state='not_configured'
            message={error ?? 'GitHub is not configured for shipping velocity.'}
            testId='hud-shipping-velocity-observation'
          />
        </div>
      ) : observation === 'empty' ? (
        <div className='flex h-50 items-center'>
          <HudObservationStatus
            state='empty'
            message='No PRs in this period. Zero is shown only after a successful observation.'
            freshnessLabel={freshnessLabel}
            testId='hud-shipping-velocity-observation'
          />
        </div>
      ) : observation === 'unavailable' && data.length === 0 ? (
        <div className='flex h-50 items-center'>
          <HudObservationStatus
            state='unavailable'
            message={error ?? 'Shipping velocity is unavailable.'}
            freshnessLabel={freshnessLabel}
            onRetry={handleRetry}
            testId='hud-shipping-velocity-observation'
          />
        </div>
      ) : showChart ? (
        <>
          <div className='min-h-14' data-testid='shipping-velocity-status-slot'>
            {observation === 'unavailable' || observation === 'stale' ? (
              <HudObservationStatus
                state={observation}
                message={
                  observation === 'stale'
                    ? (error ??
                      'Refresh unavailable; showing last verified shipping velocity.')
                    : retainedRangeMessage
                }
                freshnessLabel={freshnessLabel}
                onRetry={handleRetry}
                testId='hud-shipping-velocity-observation'
              />
            ) : null}
          </div>
          <figure
            role='img'
            aria-labelledby={titleId}
            aria-describedby={summaryId}
            data-testid='shipping-velocity-figure'
          >
            <LazyVelocityChart
              data={data}
              spotlight={spotlight}
              onLineClick={handleLineClick}
              onChartClick={handleChartClick}
              showClosed={showClosed}
            />
            <figcaption id={summaryId} className='sr-only'>
              {accessibleSummary}
            </figcaption>
          </figure>
        </>
      ) : (
        <ChartSkeleton />
      )}

      {/* Footer */}
      <div
        className='mt-2 min-h-4 truncate text-right text-3xs text-tertiary-token'
        data-testid='shipping-velocity-freshness'
      >
        {displayedRange && freshnessLabel && !isLoading
          ? `${isRefreshing ? 'Refreshing' : 'Showing'} ${displayedRange.toUpperCase()} · Updated ${freshnessLabel}${isStale ? ' · Stale' : ''}`
          : null}
      </div>
    </div>
  );
}
