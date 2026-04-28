'use client';

import { type MouseEvent as ReactMouseEvent, useRef } from 'react';

export type SparklineTrend = 'up' | 'down' | 'flat';

export interface SparklineProps {
  /**
   * Y-values for each evenly-spaced x. Must contain at least two points;
   * fewer entries collapse the chart into a single point.
   */
  readonly points: readonly number[];
  /** Tone palette — tints the line, fill, and hover playhead. */
  readonly trend: SparklineTrend;
  /** Index of the currently hovered point, or null when none. */
  readonly hoverIdx?: number | null;
  /** Called as the cursor moves over the chart; null on leave. */
  readonly onHover?: (idx: number | null) => void;
  /** Accessibility label override (defaults to a generic chart label). */
  readonly ariaLabel?: string;
  readonly className?: string;
}

const VIEWBOX_W = 340;
const VIEWBOX_H = 120;

const STROKE_BY_TREND: Record<SparklineTrend, string> = {
  up: 'rgba(165,243,252,0.85)',
  down: 'rgba(253,164,175,0.85)',
  flat: 'rgba(255,255,255,0.4)',
};
const FILL_BY_TREND: Record<SparklineTrend, string> = {
  up: 'rgba(103,232,249,0.10)',
  down: 'rgba(253,164,175,0.10)',
  flat: 'rgba(255,255,255,0.06)',
};

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
  hoverIdx,
  onHover,
  ariaLabel = 'Trend over time',
  className,
}: SparklineProps) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const xFor = (i: number) =>
    points.length <= 1 ? VIEWBOX_W / 2 : (i / (points.length - 1)) * VIEWBOX_W;
  const yFor = (v: number) => VIEWBOX_H - ((v - min) / range) * VIEWBOX_H;
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p).toFixed(1)}`
    )
    .join(' ');
  const fillPath = `${path} L ${VIEWBOX_W} ${VIEWBOX_H} L 0 ${VIEWBOX_H} Z`;
  const stroke = STROKE_BY_TREND[trend];
  const fill = FILL_BY_TREND[trend];
  const svgRef = useRef<SVGSVGElement>(null);

  function handleMove(e: ReactMouseEvent<SVGSVGElement>) {
    if (!onHover) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * VIEWBOX_W;
    const idx = Math.max(
      0,
      Math.min(
        points.length - 1,
        Math.round((px / VIEWBOX_W) * (points.length - 1))
      )
    );
    onHover(idx);
  }

  const playheadX = hoverIdx != null ? xFor(hoverIdx) : null;
  const playheadY =
    hoverIdx != null && points[hoverIdx] != null
      ? yFor(points[hoverIdx])
      : null;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: chart canvas; hover is a mouse-only affordance, exact values are surfaced in adjacent Stat blocks
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className={className ?? 'mt-3 w-full h-32 block cursor-crosshair'}
      preserveAspectRatio='none'
      role='img'
      aria-label={ariaLabel}
      onMouseMove={handleMove}
      onMouseLeave={() => onHover?.(null)}
    >
      <title>{ariaLabel}</title>
      <path d={fillPath} fill={fill} />
      <path d={path} fill='none' stroke={stroke} strokeWidth={1.5} />
      {playheadX != null && playheadY != null && (
        <>
          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={VIEWBOX_H}
            stroke='rgba(255,255,255,0.30)'
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
          <circle
            cx={playheadX}
            cy={playheadY}
            r={3}
            fill={stroke}
            stroke='rgba(0,0,0,0.45)'
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
        </>
      )}
    </svg>
  );
}
