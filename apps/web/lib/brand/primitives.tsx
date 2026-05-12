import type { CSSProperties } from 'react';
import { JOVIE_PATH, JOVIE_VIEWBOX, WORDMARK_TRACK } from '@/lib/brand/tokens';
import { computeWordmarkLayout } from '@/lib/brand/wordmark-letters';

/**
 * Server-renderable SVG primitives for the Jovie brand. No state, no hooks,
 * no client boundary. Safe to render inside server components and to inline
 * into RSC streams.
 *
 * `color` defaults to currentColor so consumers can drive ink/cream from
 * Tailwind text-color classes.
 */

interface MarkProps {
  readonly size?: number;
  readonly color?: string;
  readonly className?: string;
  readonly title?: string;
  readonly style?: CSSProperties;
}

export function Mark({
  size = 100,
  color = 'currentColor',
  className,
  title,
  style,
}: MarkProps) {
  const viewBox = `0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}`;
  const mergedStyle = { display: 'block', ...style };
  if (title) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        xmlns='http://www.w3.org/2000/svg'
        shapeRendering='geometricPrecision'
        className={className}
        style={mergedStyle}
        role='img'
        aria-label={title}
      >
        <title>{title}</title>
        <path fill={color} d={JOVIE_PATH} />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      xmlns='http://www.w3.org/2000/svg'
      shapeRendering='geometricPrecision'
      className={className}
      style={mergedStyle}
      aria-hidden='true'
    >
      <path fill={color} d={JOVIE_PATH} />
    </svg>
  );
}

interface WordmarkProps {
  readonly height?: number;
  readonly color?: string;
  readonly markAsO?: boolean;
  readonly className?: string;
  readonly title?: string;
  readonly style?: CSSProperties;
}

export function Wordmark({
  height = 40,
  color = 'currentColor',
  markAsO = false,
  className,
  title,
  style,
}: WordmarkProps) {
  const { placed, totalWidth: totalW } = computeWordmarkLayout(WORDMARK_TRACK);
  const width = (totalW / 100) * height;
  const viewBox = `0 0 ${totalW} 100`;
  const mergedStyle = { display: 'block', color, ...style };
  const glyphs = placed.map((p, i) => {
    if (p.letter === 'O' && markAsO) {
      // Drop the mark into the O slot. Mark outer R is 177 in its 360
      // viewBox, centered at (180,180). Scale 100/354 ≈ 0.2825 to fit the
      // O's 100×100 box with the ring landing where the O's ring would.
      const s = 100 / 354;
      const tx = p.x + (100 - 360 * s) / 2;
      const ty = (100 - 360 * s) / 2;
      return (
        <g
          key={`${p.letter}-${String(i)}`}
          transform={`translate(${tx} ${ty}) scale(${s})`}
        >
          <path fill='currentColor' d={JOVIE_PATH} />
        </g>
      );
    }
    return (
      <path
        key={`${p.letter}-${String(i)}`}
        fill='currentColor'
        fillRule={p.rule ?? 'nonzero'}
        transform={`translate(${p.x} 0)`}
        d={p.d}
      />
    );
  });
  if (title) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={viewBox}
        xmlns='http://www.w3.org/2000/svg'
        className={className}
        style={mergedStyle}
        role='img'
        aria-label={title}
      >
        <title>{title}</title>
        {glyphs}
      </svg>
    );
  }
  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      style={mergedStyle}
      aria-hidden='true'
    >
      {glyphs}
    </svg>
  );
}

interface LockupProps {
  readonly height?: number;
  readonly color?: string;
  readonly gap?: number;
  readonly stacked?: boolean;
  readonly className?: string;
  readonly title?: string;
}

export function Lockup({
  height = 80,
  color = 'currentColor',
  gap,
  stacked = false,
  className,
  title,
}: LockupProps) {
  const g = gap ?? height * 0.34;
  // Only opt into the role='img' announcement when the caller provides a
  // title — otherwise the lockup is decorative chrome and screen readers
  // shouldn't announce it (most consumers wrap it in a labeled link).
  const labelProps = title
    ? ({ role: 'img' as const, 'aria-label': title } as const)
    : ({ 'aria-hidden': true as const } as const);
  const baseClass = stacked
    ? 'flex flex-col items-center'
    : 'flex items-center';
  const combinedClass = className ? `${baseClass} ${className}` : baseClass;
  if (stacked) {
    return (
      <div
        className={combinedClass}
        style={{ gap: g * 0.55, color }}
        {...labelProps}
      >
        <Mark size={height * 1.5} color='currentColor' />
        <Wordmark height={height * 0.76} color='currentColor' />
      </div>
    );
  }
  return (
    <div className={combinedClass} style={{ gap: g, color }} {...labelProps}>
      <Mark size={height} color='currentColor' />
      <Wordmark height={height * 0.74} color='currentColor' />
    </div>
  );
}

/**
 * Computed total wordmark width in cap-height units (100u). Exposed for tests
 * and asset generation that needs to know the canonical width.
 */
export const WORDMARK_TOTAL_WIDTH_U =
  computeWordmarkLayout(WORDMARK_TRACK).totalWidth;
