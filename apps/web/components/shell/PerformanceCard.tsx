'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Sparkline, type SparklineTrend } from './Sparkline';

export type PerformanceRangeKey = '24h' | '7d' | '30d' | '90d' | 'YTD';

interface RangeOption {
  readonly key: PerformanceRangeKey;
  readonly label: string;
  readonly days: number;
}

const DEFAULT_RANGES: readonly RangeOption[] = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: 'YTD', label: 'YTD', days: 120 },
];

export interface PerformanceCardProps {
  /** Caption above the headline metric (e.g. "Smart link", "Streams"). */
  readonly title: string;
  /**
   * Suffix on the headline metric when not hovering (e.g. "clicks",
   * "streams", "plays"). When hovering a point in the chart the suffix
   * flips to "on day".
   */
  readonly metricLabel: string;
  /**
   * Pre-computed points for each surfaced range. Callers fetch / cache
   * their own data; the card never synthesises numbers. Ranges absent
   * from this map are hidden from the pill selector.
   */
  readonly pointsByRange: Partial<
    Record<PerformanceRangeKey, readonly number[]>
  >;
  /** Tone palette for the line + fill (forwarded to Sparkline). */
  readonly trend: SparklineTrend;
  /** Percent change over the trailing window. Positive = up, negative = down. */
  readonly delta: number;
  /** Override the initial selected range. Falls back to the first range present. */
  readonly initialRange?: PerformanceRangeKey;
  /** Override the chart's accessible label. */
  readonly chartLabel?: string;
  readonly className?: string;
}

function formatDayOffset(offset: number): string {
  if (offset === 0) return 'today';
  if (offset === -1) return 'yesterday';
  return `${Math.abs(offset)}d ago`;
}

/**
 * PerformanceCard — range pill selector + headline metric + Sparkline.
 * Surfaces a 24h / 7d / 30d / 90d / YTD time-window switcher; the
 * headline metric flips between "average for last <range>" and "value
 * on day X" as the user hovers points in the chart.
 *
 * The card is intentionally data-agnostic: callers pass
 * `pointsByRange` (their own cached / fetched series) and a `trend`
 * discriminator. The card never synthesises numbers, so production
 * data is always the source of truth.
 *
 * @example
 * ```tsx
 * <PerformanceCard
 *   title='Smart link'
 *   metricLabel='clicks'
 *   pointsByRange={{
 *     '7d': [12, 14, 11, 18, 22, 19, 24],
 *     '30d': pastMonthClicks,
 *   }}
 *   trend='up'
 *   delta={12.4}
 *   initialRange='7d'
 * />
 * ```
 */
export function PerformanceCard({
  title,
  metricLabel,
  pointsByRange,
  trend,
  delta,
  initialRange,
  chartLabel,
  className,
}: PerformanceCardProps) {
  const surfacedRanges = useMemo(
    () => DEFAULT_RANGES.filter(r => pointsByRange[r.key] !== undefined),
    [pointsByRange]
  );
  const fallbackRange = surfacedRanges[0]?.key ?? '7d';
  const [range, setRange] = useState<PerformanceRangeKey>(
    initialRange && pointsByRange[initialRange] !== undefined
      ? initialRange
      : fallbackRange
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const points = (pointsByRange[range] ?? []) as readonly number[];
  const days = surfacedRanges.find(r => r.key === range)?.days ?? points.length;
  const total = points.reduce((a, b) => a + b, 0);
  const activeIdx = hoverIdx ?? points.length - 1;
  const activeValue = points[activeIdx] ?? 0;
  const headlineValue =
    hoverIdx !== null
      ? activeValue
      : days > 0
        ? Math.round((total / Math.max(days, 1)) * 7)
        : 0;
  const valueLabel = hoverIdx !== null ? 'on day' : metricLabel;
  const dayLabel =
    hoverIdx !== null
      ? formatDayOffset(activeIdx - (points.length - 1))
      : `last ${range}`;

  const trendUp = trend === 'up';
  const trendFlat = trend === 'flat';

  return (
    <div className={className}>
      <div className='flex items-center justify-between mb-2'>
        <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          {title}
        </p>
        {surfacedRanges.length > 1 && (
          <div
            role='tablist'
            aria-label={`${title} range`}
            className='flex items-center gap-0.5 p-0.5 rounded-full bg-(--surface-0)/70 border border-(--linear-app-shell-border)/70'
          >
            {surfacedRanges.map(r => {
              const on = r.key === range;
              return (
                <button
                  key={r.key}
                  type='button'
                  role='tab'
                  aria-selected={on}
                  onClick={() => {
                    setRange(r.key);
                    setHoverIdx(null);
                  }}
                  className={cn(
                    'h-5 px-2 rounded-full text-[10px] font-medium tracking-[-0.005em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
                    on
                      ? 'bg-(--surface-2) text-primary-token ring-1 ring-inset ring-white/10'
                      : 'text-tertiary-token hover:text-primary-token'
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className='flex items-baseline gap-2'>
        <span className='text-[20px] font-semibold text-primary-token tabular-nums'>
          {headlineValue.toLocaleString()}
        </span>
        <span className='text-[11px] text-tertiary-token'>{valueLabel}</span>
        <span className='text-[11px] text-quaternary-token tabular-nums'>
          · {dayLabel}
        </span>
        {hoverIdx === null && (
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-0.5 text-[11px] tabular-nums',
              trendFlat
                ? 'text-tertiary-token'
                : trendUp
                  ? 'text-cyan-200/85'
                  : 'text-rose-300/85'
            )}
          >
            {trendUp ? (
              <ArrowUp className='h-3 w-3' strokeWidth={2.25} />
            ) : trendFlat ? null : (
              <ArrowDown className='h-3 w-3' strokeWidth={2.25} />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>

      <Sparkline
        points={points}
        trend={trend}
        hoverIdx={hoverIdx}
        onHover={setHoverIdx}
        ariaLabel={chartLabel ?? `${title} ${range}`}
      />
    </div>
  );
}
