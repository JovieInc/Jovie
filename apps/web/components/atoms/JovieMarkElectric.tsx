'use client';

import { type CSSProperties, useId } from 'react';
import {
  JOVIE_ICON_PATH,
  JOVIE_ICON_VIEW_BOX,
} from '@/components/atoms/jovie-icon-path';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface JovieMarkElectricProps {
  /**
   * Pixel size for both width and height. When omitted, the SVG fills its
   * container (use the optional `style` prop or a wrapper to size it).
   */
  readonly size?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  /**
   * Whether to animate the electric spark traveling around the perimeter.
   * Defaults to true; falls back to false when prefers-reduced-motion is set.
   * Pass false explicitly to render the static outline (used for reduced-motion
   * fallbacks that still need the same visual idiom).
   */
  readonly spark?: boolean;
}

const ASPECT_RATIO = 347.97 / 353.68;

export function JovieMarkElectric({
  size,
  className,
  style,
  spark = true,
}: JovieMarkElectricProps) {
  const reactId = useId();
  const safeId = reactId.replace(/[^a-zA-Z0-9_-]/g, '');
  const filterId = `jve-filter-${safeId}`;
  const styleId = `jve-style-${safeId}`;
  const sparkAnimationName = `jve-pulse-${safeId}`;

  const prefersReducedMotion = useReducedMotion();
  const showSpark = spark && !prefersReducedMotion;

  return (
    <span
      aria-hidden='true'
      className={cn('inline-block', className)}
      style={{ lineHeight: 0, ...style }}
    >
      {showSpark && (
        <style id={styleId}>{`
          @keyframes ${sparkAnimationName} {
            0%   { stroke-dashoffset: 0;     opacity: 0; }
            8%   { stroke-dashoffset: -80;   opacity: 0.9; }
            55%  { stroke-dashoffset: -700;  opacity: 0.9; }
            70%  { stroke-dashoffset: -950;  opacity: 0; }
            100% { stroke-dashoffset: -1000; opacity: 0; }
          }
        `}</style>
      )}
      <svg
        width={size ?? '100%'}
        height={size === undefined ? '100%' : size * ASPECT_RATIO}
        viewBox={JOVIE_ICON_VIEW_BOX}
        shapeRendering='geometricPrecision'
        style={{ display: 'block' }}
        aria-hidden='true'
      >
        <defs>
          <filter id={filterId} x='-30%' y='-30%' width='160%' height='160%'>
            <feGaussianBlur stdDeviation='2.5' />
          </filter>
        </defs>
        <path
          d={JOVIE_ICON_PATH}
          fill='none'
          stroke='rgba(255,255,255,0.085)'
          strokeWidth='1.2'
        />
        {showSpark && (
          <>
            <path
              pathLength='1000'
              d={JOVIE_ICON_PATH}
              fill='none'
              stroke='rgba(255,255,255,0.85)'
              strokeWidth='1.4'
              strokeDasharray='55 945'
              strokeLinecap='round'
              filter={`url(#${filterId})`}
              style={{
                animation: `${sparkAnimationName} 18s var(--ds-motion-subtle-easing) infinite`,
              }}
            />
            <path
              pathLength='1000'
              d={JOVIE_ICON_PATH}
              fill='none'
              stroke='rgba(255,255,255,0.95)'
              strokeWidth='0.55'
              strokeDasharray='22 978'
              strokeLinecap='round'
              style={{
                animation: `${sparkAnimationName} 18s var(--ds-motion-subtle-easing) infinite`,
              }}
            />
          </>
        )}
      </svg>
    </span>
  );
}
