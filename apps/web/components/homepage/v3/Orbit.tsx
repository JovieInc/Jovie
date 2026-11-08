import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Orbit, the homepage's signature device (approved v3): concentric
 * hairline rings with one lit ion arc that is also the section's key light.
 * Geometry is computed at render, so the page ships it as static SVG.
 */
export interface OrbitProps {
  /** Unique per page: it names the arc gradient and blur filter. */
  readonly id: string;
  /** Ring diameters in px, outermost first. */
  readonly rings: readonly number[];
  /** Lit arc start angle and sweep, in degrees clockwise from 12 o'clock. */
  readonly arc: readonly [number, number];
  /** Index of the ring that carries the lit arc. */
  readonly arcRing?: number;
  /** A closed ring with no lit arc (the invitation). */
  readonly closed?: boolean;
  readonly className?: string;
}

const PAD = 20;

function point(radius: number, degrees: number): readonly [number, number] {
  const angle = ((degrees - 90) * Math.PI) / 180;
  return [radius + radius * Math.cos(angle), radius + radius * Math.sin(angle)];
}

const round = (value: number) => Math.round(value * 100) / 100;

export function Orbit({
  id,
  rings,
  arc,
  arcRing = 0,
  closed = false,
  className,
}: OrbitProps) {
  const outer = rings[0] / 2;
  const size = rings[0] + PAD * 2;
  const arcRadius = (rings[arcRing] ?? rings[0]) / 2;
  const at = (degrees: number) => {
    const [x, y] = point(arcRadius, degrees);
    return [round(x + outer - arcRadius), round(y + outer - arcRadius)];
  };
  const [start, sweep] = arc;
  const [x1, y1] = at(start);
  const [x2, y2] = at(start + sweep);
  const [lx, ly] = at(start + sweep * 0.55);
  const d = `M${x1} ${y1} A${arcRadius} ${arcRadius} 0 0 1 ${x2} ${y2}`;
  const style = {
    width: size,
    height: size,
    '--hv3-lx': `${lx + PAD}px`,
    '--hv3-ly': `${ly + PAD}px`,
  } as CSSProperties;

  return (
    <div
      aria-hidden
      className={cn('hv3-orbit', closed && 'hv3-orbit--closed', className)}
      style={style}
    >
      <svg
        aria-hidden
        className='hv3-orbit__svg'
        viewBox={`${-PAD} ${-PAD} ${size} ${size}`}
        width={size}
        height={size}
      >
        <defs>
          <linearGradient
            id={id}
            gradientUnits='userSpaceOnUse'
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          >
            <stop offset='0' stopOpacity='0' />
            <stop offset='0.55' stopOpacity='1' />
            <stop offset='1' stopOpacity='0' />
          </linearGradient>
          <filter
            id={`${id}-blur`}
            x='-50%'
            y='-50%'
            width='200%'
            height='200%'
          >
            <feGaussianBlur stdDeviation='7' />
          </filter>
        </defs>
        {rings.map((diameter, index) => (
          <circle
            key={diameter}
            cx={outer}
            cy={outer}
            r={diameter / 2}
            className={cn(
              'hv3-orbit__ring',
              index === 0 && 'hv3-orbit__ring--outer'
            )}
          />
        ))}
        {closed ? (
          <circle
            cx={outer}
            cy={outer}
            r={outer}
            className='hv3-orbit__closed'
          />
        ) : (
          <>
            <path
              d={d}
              stroke={`url(#${id})`}
              filter={`url(#${id}-blur)`}
              className='hv3-orbit__bloom'
            />
            <path d={d} stroke={`url(#${id})`} className='hv3-orbit__arc' />
            <path d={d} pathLength={100} className='hv3-orbit__sweep' />
          </>
        )}
      </svg>
    </div>
  );
}
