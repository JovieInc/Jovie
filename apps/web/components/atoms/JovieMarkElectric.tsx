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
  const sparkDuration = 'calc(var(--ds-motion-cinematic-duration) * 3.5)';
  const sparkDelay = 'calc(var(--ds-motion-subtle-duration) * 1.6)';

  return (
    <span
      aria-hidden='true'
      className={cn('inline-block', className)}
      style={{ lineHeight: 0, ...style }}
    >
      {showSpark && (
        <style id={styleId}>{`
          @keyframes ${sparkAnimationName} {
            0%   { stroke-dashoffset: 45;    opacity: 0; }
            14%  { stroke-dashoffset: -120;  opacity: 0.56; }
            48%  { stroke-dashoffset: -520;  opacity: 0.68; }
            78%  { stroke-dashoffset: -820;  opacity: 0.22; }
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
          stroke='rgba(255,255,255,0.04)'
          strokeWidth='1'
        />
        {showSpark && (
          <>
            <path
              pathLength='1000'
              d={JOVIE_ICON_PATH}
              fill='none'
              stroke='rgba(78,190,255,0.76)'
              strokeWidth='1.4'
              strokeDasharray='50 950'
              strokeLinecap='round'
              filter={`url(#${filterId})`}
              style={{
                animationName: sparkAnimationName,
                animationDuration: sparkDuration,
                animationTimingFunction: 'var(--ds-motion-subtle-easing)',
                animationIterationCount: 2,
                animationFillMode: 'both',
                animationDelay: sparkDelay,
              }}
            />
            <path
              pathLength='1000'
              d={JOVIE_ICON_PATH}
              fill='none'
              stroke='rgba(236,250,255,0.88)'
              strokeWidth='0.55'
              strokeDasharray='20 980'
              strokeLinecap='round'
              style={{
                animationName: sparkAnimationName,
                animationDuration: sparkDuration,
                animationTimingFunction: 'var(--ds-motion-subtle-easing)',
                animationIterationCount: 2,
                animationFillMode: 'both',
                animationDelay: sparkDelay,
              }}
            />
          </>
        )}
      </svg>
    </span>
  );
}
