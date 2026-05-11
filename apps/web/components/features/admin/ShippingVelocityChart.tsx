'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';

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

function formatCachedAgo(cachedAt: string): string {
  const diff = Date.now() - new Date(cachedAt).getTime();
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
    <div className='h-[200px] w-full rounded-lg bg-black/40' aria-hidden='true'>
      <svg
        role='img'
        aria-label='Loading chart'
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
                index === 0 ? '#8B5CF6' : index === 1 ? '#22C55E' : '#EF4444'
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
    <div className='rounded-lg border border-white/10 bg-[#0f0f0f] px-3 py-2 shadow-lg'>
      <p className='mb-1 text-[11px] font-semibold text-white/60'>
        {dateLabel}
      </p>
      <p className='text-[12px] text-white/90'>{parts.join(', ')}</p>
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
            >
              <defs>
                <linearGradient id='mergedGradient' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='#8B5CF6' stopOpacity={0.08} />
                  <stop offset='95%' stopColor='#8B5CF6' stopOpacity={0} />
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
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />

              {/* Merged PRs — hero series (purple) */}
              <Area
                type='monotone'
                dataKey='merged'
                stroke='#8B5CF6'
                strokeWidth={2.5}
                fill='url(#mergedGradient)'
                dot={false}
                activeDot={{
                  r: 4,
                  fill: '#8B5CF6',
                  stroke: '#0a0a0a',
                  strokeWidth: 2,
                  onClick: () => onLineClick('merged'),
                }}
                opacity={mergedOpacity}
                onClick={() => onLineClick('merged')}
                style={{ cursor: 'pointer' }}
              />

              {/* Opened PRs — ghost green */}
              <Area
                type='monotone'
                dataKey='opened'
                stroke='#22C55E'
                strokeWidth={1.5}
                fill='none'
                dot={false}
                activeDot={{
                  r: 3,
                  fill: '#22C55E',
                  stroke: '#0a0a0a',
                  strokeWidth: 2,
                  onClick: () => onLineClick('opened'),
                }}
                opacity={openedOpacity * 0.35}
                onClick={() => onLineClick('opened')}
                style={{ cursor: 'pointer' }}
              />

              {/* Closed without merge — hidden by default */}
              {showClosed ? (
                <Area
                  type='monotone'
                  dataKey='closed'
                  stroke='#EF4444'
                  strokeWidth={1.5}
                  fill='none'
                  dot={false}
                  activeDot={{
                    r: 3,
                    fill: '#EF4444',
                    stroke: '#0a0a0a',
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
  const [range, setRange] = useState<Range>(initialRange);
  const [data, setData] = useState<DailyBucket[]>(initialData ?? []);
  const [cachedAt, setCachedAt] = useState<string | undefined>(initialCachedAt);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const fetchData = useCallback(async (r: Range) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/hud/shipping-velocity?range=${r}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch (${response.status})`);
      }
      const result = (await response.json()) as ShippingVelocityResponse;
      setData(result.data);
      setCachedAt(result.cachedAt);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load shipping data'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when range changes (but not on initial mount if initialData is provided)
  useEffect(() => {
    if (initialData && range === initialRange) return;
    fetchData(range).catch(() => {});
  }, [range, fetchData, initialData, initialRange]);

  function handleRangeChange(newRange: Range) {
    setRange(newRange);
    setSpotlight(null);
  }

  function handleLineClick(series: string) {
    setSpotlight(prev => (prev === series ? null : series));
  }

  function handleChartClick() {
    setSpotlight(null);
  }

  const isEmpty =
    !isLoading &&
    !error &&
    data.every(d => d.merged === 0 && d.opened === 0 && d.closed === 0);

  return (
    <div className='rounded-xl bg-[#0a0a0a] p-4'>
      {/* Header row */}
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40'>
            Shipping Velocity
          </p>
          {/* Legend */}
          <div className='flex items-center gap-2.5'>
            <button
              type='button'
              onClick={() => handleLineClick('merged')}
              className='flex items-center gap-1 opacity-80 transition-opacity hover:opacity-100'
              aria-label='Toggle merged series spotlight'
            >
              <span
                className='block h-[2px] w-3 rounded-full'
                style={{ backgroundColor: '#8B5CF6' }}
              />
              <span className='text-[10px] text-white/40'>Merged</span>
            </button>
            <button
              type='button'
              onClick={() => handleLineClick('opened')}
              className='flex items-center gap-1 opacity-80 transition-opacity hover:opacity-100'
              aria-label='Toggle opened series spotlight'
            >
              <span
                className='block h-[2px] w-3 rounded-full'
                style={{ backgroundColor: '#22C55E' }}
              />
              <span className='text-[10px] text-white/40'>Opened</span>
            </button>
            <button
              type='button'
              onClick={() => setShowClosed(prev => !prev)}
              className='flex items-center gap-1 transition-opacity hover:opacity-100'
              style={{ opacity: showClosed ? 0.8 : 0.4 }}
              aria-label='Toggle closed series visibility'
            >
              <span
                className='block h-[2px] w-3 rounded-full'
                style={{ backgroundColor: '#EF4444' }}
              />
              <span className='text-[10px] text-white/40'>Closed</span>
            </button>
          </div>
        </div>

        {/* Range toggle */}
        <div className='flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5'>
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type='button'
              onClick={() => handleRangeChange(opt.value)}
              className={
                range === opt.value
                  ? 'rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white'
                  : 'rounded-md px-2.5 py-1 text-[11px] font-medium text-white/40 transition-colors hover:text-white/70'
              }
              aria-pressed={range === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {isLoading ? (
        <ChartSkeleton />
      ) : error ? (
        <div className='flex h-[200px] flex-col items-center justify-center gap-2'>
          <p className='text-[13px] text-white/40'>{error}</p>
          {cachedAt ? (
            <p className='text-[11px] text-white/25'>
              Last updated {formatCachedAgo(cachedAt)}
            </p>
          ) : null}
          <button
            type='button'
            onClick={() => {
              fetchData(range).catch(() => {});
            }}
            className='mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/80'
          >
            Retry
          </button>
        </div>
      ) : isEmpty ? (
        <div className='flex h-[200px] items-center justify-center'>
          <p className='text-[13px] text-white/30'>No PRs in this period</p>
        </div>
      ) : (
        <LazyVelocityChart
          data={data}
          spotlight={spotlight}
          onLineClick={handleLineClick}
          onChartClick={handleChartClick}
          showClosed={showClosed}
        />
      )}

      {/* Footer */}
      {cachedAt && !isLoading && !error ? (
        <p className='mt-2 text-right text-[10px] text-white/20'>
          Updated {formatCachedAgo(cachedAt)}
        </p>
      ) : null}
    </div>
  );
}
