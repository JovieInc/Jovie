// @coverage-via apps/web/components/marketing/MarketingEditorialBackground.test.tsx
'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import './MarketingEditorialBackground.css';

export const MARKETING_EDITORIAL_BACKGROUND_VARIANTS = [
  'soft',
  'flowing',
] as const;

export type MarketingEditorialBackgroundVariant =
  (typeof MARKETING_EDITORIAL_BACKGROUND_VARIANTS)[number];

export const MARKETING_EDITORIAL_BACKGROUND_FOCAL_X = [
  'center',
  'left',
  'right',
] as const;

export const MARKETING_EDITORIAL_BACKGROUND_FOCAL_Y = [
  'center',
  'top',
  'bottom',
] as const;

export type MarketingEditorialBackgroundFocalX =
  (typeof MARKETING_EDITORIAL_BACKGROUND_FOCAL_X)[number];
export type MarketingEditorialBackgroundFocalY =
  (typeof MARKETING_EDITORIAL_BACKGROUND_FOCAL_Y)[number];

export interface MarketingEditorialBackgroundProps {
  /**
   * Soft: broad low-contrast transitions with gentle depth.
   * Flowing: one dominant sweep with subordinate curves and a
   * motivated highlight along the same directional flow.
   */
  readonly variant: MarketingEditorialBackgroundVariant;
  /** Declared focal location for desktop. Off-center placement stays
   * legitimate; the light source is never required to sit at center. */
  readonly focalX?: MarketingEditorialBackgroundFocalX;
  readonly focalY?: MarketingEditorialBackgroundFocalY;
  /** Optional bounded motion sweep for the flowing variant. Follows the
   * same directional flow; disabled under prefers-reduced-motion. */
  readonly motion?: boolean;
  readonly className?: string;
  readonly idSeed?: string;
}

const VIEW_BOX = '0 0 1200 24';
const SEAM_PATH =
  'M0 12 C120 12 164 12 246 12 S382 11 480 12 S620 13 718 12 S856 11 960 12 S1090 12 1200 12';

export function MarketingEditorialBackground({
  variant,
  focalX = 'center',
  focalY = 'center',
  motion = false,
  className,
  idSeed,
}: MarketingEditorialBackgroundProps) {
  const reactId = useId();
  const safeId =
    (idSeed ?? reactId).replace(/[^a-zA-Z0-9_-]/g, '') || 'editorial-bg';
  const animationName = `marketing-editorial-sweep-${safeId}`;

  return (
    <div
      aria-hidden='true'
      className={cn('marketing-editorial-background', className)}
      data-variant={variant}
      data-focal-x={focalX}
      data-focal-y={focalY}
      data-testid='marketing-editorial-background'
    >
      {variant === 'soft' ? (
        <div className='marketing-editorial-background__field' />
      ) : (
        <>
          <div
            className={cn(
              'marketing-editorial-background__sweep',
              focalY === 'top' &&
                'marketing-editorial-background__sweep--raised',
              focalY === 'bottom' &&
                'marketing-editorial-background__sweep--lowered'
            )}
          />
          {motion && (
            <style>{`
              @keyframes ${animationName} {
                0% { opacity: 0.32; }
                50% { opacity: 0.42; }
                100% { opacity: 0.32; }
              }
              .marketing-editorial-background__sweep {
                animation: ${animationName} calc(var(--ds-motion-cinematic-duration) * 3) var(--ds-motion-subtle-easing) infinite alternate;
              }
            `}</style>
          )}
          <span className='marketing-editorial-background__seam'>
            <svg
              aria-hidden='true'
              height='24'
              preserveAspectRatio='none'
              shapeRendering='geometricPrecision'
              viewBox={VIEW_BOX}
              width='100%'
            >
              <defs>
                <filter
                  id={`marketing-editorial-seam-glow-${safeId}`}
                  x='-5%'
                  y='-300%'
                  width='110%'
                  height='700%'
                >
                  <feGaussianBlur stdDeviation='1.8' />
                </filter>
              </defs>
              <path
                d={SEAM_PATH}
                fill='none'
                opacity='0.3'
                stroke='var(--marketing-editorial-seam-base)'
                strokeWidth='0.8'
              />
              <path
                data-seam-glow='true'
                d={SEAM_PATH}
                fill='none'
                filter={`url(#marketing-editorial-seam-glow-${safeId})`}
                opacity='0.45'
                stroke='var(--marketing-editorial-seam-glow)'
                strokeWidth='2.2'
              />
            </svg>
          </span>
        </>
      )}
    </div>
  );
}
