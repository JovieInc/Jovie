import { JOVIE_BRAND_GEOMETRY } from '@jovie/ui/brand/geometry.gen';
import type { CSSProperties } from 'react';
import { JOVIE_PATH, JOVIE_VIEWBOX } from '@/lib/brand/tokens';

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

type WordmarkMaster = keyof typeof JOVIE_BRAND_GEOMETRY.wordmark;

/**
 * The "Jovie" wordmark as static outlines from the construction
 * (packages/brand). Its o is the mark itself. Below 24 px the Text master
 * (open seam, looser spacing) is used. For the animated wordmark that folds
 * into the O, render <JovieWordmark> from @jovie/ui/brand.
 */
export function wordmarkGeometry(height: number) {
  const master: WordmarkMaster = height < 24 ? 'text' : 'display';
  const w = JOVIE_BRAND_GEOMETRY.wordmark[master];
  const [, , width, boxHeight] = w.viewBox;
  return {
    master,
    viewBox: `0 0 ${width} ${boxHeight}`,
    aspect: width / boxHeight,
    glyphs: w.glyphs.map(g => ({ char: g.char, d: g.d })),
  };
}

interface WordmarkProps {
  readonly height?: number;
  readonly color?: string;
  readonly className?: string;
  readonly title?: string;
  readonly style?: CSSProperties;
}

export function Wordmark({
  height = 40,
  color = 'currentColor',
  className,
  title,
  style,
}: WordmarkProps) {
  const g = wordmarkGeometry(height);
  const mergedStyle = { display: 'block', color, ...style };
  return (
    <svg
      width={height * g.aspect}
      height={height}
      viewBox={g.viewBox}
      xmlns='http://www.w3.org/2000/svg'
      className={className}
      style={mergedStyle}
      fill='currentColor'
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {title ? <title>{title}</title> : null}
      {g.glyphs.map(glyph => (
        <path key={glyph.char} d={glyph.d} />
      ))}
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

interface TokenSwatchProps {
  readonly label: string;
  readonly value: string;
}

/**
 * Visual token sample driven by a canonical CSS-variable value. Public page
 * code never needs to copy a color literal.
 */
export function TokenSwatch({ label, value }: TokenSwatchProps) {
  const style = {
    '--system-b-brand-swatch': value,
  } as CSSProperties;

  return (
    <li className='system-b-brand-token' style={style}>
      <span className='system-b-brand-token-swatch' aria-hidden='true' />
      <span className='system-b-brand-token-copy'>
        <strong>{label}</strong>
        <code>{value}</code>
      </span>
    </li>
  );
}

export function Lockup({
  height = 80,
  color = 'currentColor',
  gap,
  stacked = false,
  className,
  title = 'Jovie',
}: LockupProps) {
  const g = gap ?? height * 0.34;
  if (stacked) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: g * 0.55,
          color,
        }}
        role='img'
        aria-label={title}
      >
        <Mark size={height * 1.5} color='currentColor' />
        <Wordmark height={height * 0.76} color='currentColor' />
      </div>
    );
  }
  // The o in the wordmark is the mark, so the horizontal lockup is the
  // wordmark alone; a mark beside it would show the O twice.
  return (
    <div className={className} style={{ color }} role='img' aria-label={title}>
      <Wordmark height={height * 0.74} color='currentColor' />
    </div>
  );
}

/** Wordmark width in units of its own height (display master). */
export const WORDMARK_ASPECT = wordmarkGeometry(40).aspect;
