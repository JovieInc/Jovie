'use client';

import { type CSSProperties, useId } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

interface HomepageElectricSeamProps {
  readonly className?: string;
  readonly idSeed?: string;
  readonly spark?: boolean;
}

const VIEW_BOX = '0 0 1200 24';
const SEAM_PATH =
  'M0 12 C120 12 164 12 246 12 S382 11 480 12 S620 13 718 12 S856 11 960 12 S1090 12 1200 12';

export function HomepageElectricSeam({
  className,
  idSeed,
  spark = true,
}: HomepageElectricSeamProps) {
  const reactId = useId();
  const safeId = (idSeed ?? reactId).replace(/[^a-zA-Z0-9_-]/g, '') || 'seam';
  const sparkFilterId = `homepage-electric-seam-spark-${safeId}`;
  const glowFilterId = `homepage-electric-seam-glow-${safeId}`;
  const animationName = `homepage-electric-seam-travel-${safeId}`;
  const prefersReducedMotion = useReducedMotion();
  const showSpark = spark && !prefersReducedMotion;
  const sparkStyle: CSSProperties = {
    animationName,
    animationDuration: 'calc(var(--ds-motion-cinematic-duration) * 1.5)',
    animationTimingFunction: 'var(--ds-motion-subtle-easing)',
    animationIterationCount: 1,
    animationFillMode: 'both',
    animationDelay: 'var(--ds-motion-subtle-duration)',
  };

  return (
    <span
      aria-hidden='true'
      className={cn('block h-6 w-full', className)}
      data-testid='homepage-electric-seam'
      style={{ lineHeight: 0 }}
    >
      {showSpark && (
        <style>{`
          @keyframes ${animationName} {
            0% { stroke-dashoffset: 118; opacity: 0; }
            18% { stroke-dashoffset: 74; opacity: 0.68; }
            62% { stroke-dashoffset: -420; opacity: 0.82; }
            100% { stroke-dashoffset: -760; opacity: 0; }
          }
        `}</style>
      )}
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
            id={sparkFilterId}
            x='-5%'
            y='-300%'
            width='110%'
            height='700%'
          >
            <feGaussianBlur stdDeviation='3.2' />
          </filter>
          <filter
            id={glowFilterId}
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
          stroke='var(--homepage-electric-seam-base)'
          strokeWidth='0.8'
        />
        <path
          data-seam-glow='true'
          d={SEAM_PATH}
          fill='none'
          filter={`url(#${glowFilterId})`}
          opacity='0.45'
          stroke='var(--homepage-electric-seam-glow)'
          strokeWidth='2.2'
        />
        {showSpark && (
          <>
            <path
              d={SEAM_PATH}
              fill='none'
              pathLength='1000'
              stroke='var(--homepage-electric-seam-spark)'
              strokeDasharray='86 914'
              strokeLinecap='round'
              strokeWidth='3.2'
              filter={`url(#${sparkFilterId})`}
              style={sparkStyle}
            />
            <path
              d={SEAM_PATH}
              fill='none'
              pathLength='1000'
              stroke='var(--homepage-electric-seam-core)'
              strokeDasharray='34 966'
              strokeLinecap='round'
              strokeWidth='1.05'
              style={sparkStyle}
            />
          </>
        )}
      </svg>
    </span>
  );
}
