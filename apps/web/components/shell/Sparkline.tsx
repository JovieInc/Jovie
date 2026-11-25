'use client';

import {
  type MouseEvent as ReactMouseEvent,
  useId,
  useMemo,
  useRef,
} from 'react';
import {
  DELTA_FILL,
  DELTA_STROKE,
  deltaSentiment,
  type MetricPolarity,
} from '@/lib/design/metric-tone';
import {
  isMeasurement,
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
  sparklineGeometry,
} from './sparkline-geometry';

export type SparklineTrend = 'up' | 'down' | 'flat';

export type SparklineVariant = 'area' | 'pulse';

export interface SparklineProps {
  /**
   * One observation per equal period. Use null for an unmeasured period.
   */
  readonly points: readonly (number | null)[];
  /** Tone palette — tints the line, fill, and hover playhead. */
  readonly trend: SparklineTrend;
  /**
   * Whether a rise is good news (ASR-041). The line is green only when it
   * moves the good way. Defaults to higher-is-better.
   */
  readonly polarity?: MetricPolarity;
  /**
   * `area` (default): filled track under the line.
   * `pulse`: line-only glance chart — no fill panel (Story First flat rail).
   */
  readonly variant?: SparklineVariant;
  /** Index of the currently hovered point, or null when none. */
  readonly hoverIdx?: number | null;
  /** Called as the cursor moves over the chart; null on leave. */
  readonly onHover?: (idx: number | null) => void;
  /** Accessibility label override (defaults to a generic chart label). */
  readonly ariaLabel?: string;
  readonly className?: string;
}

// Colors come from the shared delta sentiment maps, which use the status
// TEXT tokens (not the neon fills) so the line clears 3:1 in both modes.
const PLAYHEAD_STROKE = 'var(--color-border-strong)';
const POINT_OUTLINE = 'var(--color-bg-base)';

/**
 * Sparkline — minimal area-under-line chart. Single SVG, no chart
 * library. Colors derive from a `trend` discriminator (`up` / `down` /
 * `flat`) so callers compute trend once and the chart paints itself
 * consistently.
 *
 * Hover is a mouse-only affordance; surface exact values in adjacent
 * `<Stat>` blocks so the chart isn't the sole source of truth for
 * keyboard / screen-reader users.
 *
 * @example
 * ```tsx
 * const points = [12, 14, 11, 18, 22, 19, 24];
 * const trend: SparklineTrend = points.at(-1)! > points[0]! ? 'up' : 'down';
 * const [idx, setIdx] = useState<number | null>(null);
 * return (
 *   <Sparkline points={points} trend={trend} hoverIdx={idx} onHover={setIdx} />
 * );
 * ```
 */
export function Sparkline({
  points,
  trend,
  polarity = 'higher-is-better',
  variant = 'area',
  hoverIdx,
  onHover,
  ariaLabel = 'Trend over time',
  className,
}: SparklineProps) {
  const { path, fillPath, description, samplingNote, xFor, yFor } = useMemo(
    () => sparklineGeometry(points, variant),
    [points, variant]
  );
  const descriptionId = useId();
  const sentiment = deltaSentiment(trend, polarity);
  const stroke = DELTA_STROKE[sentiment];
  const fill = DELTA_FILL[sentiment];
  const strokeWidth = variant === 'pulse' ? 2 : 1.5;
  const svgRef = useRef<SVGSVGElement>(null);

  function handleMove(e: ReactMouseEvent<SVGSVGElement>) {
    if (!onHover) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || points.length === 0) {
      onHover(null);
      return;
    }
    const fraction = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(
      0,
      Math.min(points.length - 1, Math.round(fraction * (points.length - 1)))
    );
    onHover(idx);
  }

  const playheadX = hoverIdx != null ? xFor(hoverIdx) : null;
  const selectedValue = hoverIdx == null ? null : points[hoverIdx];
  const playheadY = isMeasurement(selectedValue) ? yFor(selectedValue) : null;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: chart canvas; hover is a mouse-only affordance, exact values are surfaced in adjacent Stat blocks
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      className={className ?? 'mt-3 w-full h-32 block cursor-crosshair'}
      preserveAspectRatio='none'
      role='img'
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      onMouseMove={handleMove}
      onMouseLeave={() => onHover?.(null)}
    >
      <title>
        {samplingNote ? `${ariaLabel}. ${samplingNote}` : ariaLabel}
      </title>
      <desc id={descriptionId}>{description}</desc>
      {fillPath ? <path d={fillPath} fill={fill} /> : null}
      {path ? (
        <path
          d={path}
          fill='none'
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap='round'
          strokeLinejoin='round'
          vectorEffect='non-scaling-stroke'
          data-sparkline-variant={variant}
        />
      ) : null}
      {playheadX != null && playheadY != null && (
        <>
          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={SPARKLINE_HEIGHT}
            stroke={PLAYHEAD_STROKE}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
          <circle
            cx={playheadX}
            cy={playheadY}
            r={3}
            fill={stroke}
            stroke={POINT_OUTLINE}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
        </>
      )}
    </svg>
  );
}
