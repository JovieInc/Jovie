'use client';

import { useId } from 'react';
import type { ReleaseStatus } from './demo-types';

const SIZE = 14;

const STATUS_CONFIG: Record<ReleaseStatus, { color: string; label: string }> = {
  live: { color: 'var(--color-success)', label: 'Live' },
  syncing: { color: 'var(--color-info)', label: 'Syncing' },
  scheduled: { color: 'var(--color-warning)', label: 'Scheduled' },
  draft: { color: 'var(--color-text-quaternary-token)', label: 'Draft' },
  archived: { color: 'var(--color-text-tertiary-token)', label: 'Archived' },
};

export function DemoStatusIcon({ status }: { readonly status: ReleaseStatus }) {
  const { color, label } = STATUS_CONFIG[status];
  const titleId = useId();

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox='0 0 14 14'
      fill='none'
      aria-labelledby={titleId}
      className='shrink-0'
    >
      <title id={titleId}>{label}</title>
      {status === 'live' && (
        <g>
          <circle cx='7' cy='7' r='5' fill={color} />
          <path
            d='M4.5 7L6.5 9L9.5 5'
            stroke='white'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            fill='none'
          />
        </g>
      )}
      {status === 'syncing' && (
        <>
          <circle
            cx='7'
            cy='7'
            r='4.5'
            stroke={color}
            strokeWidth='1.5'
            fill='none'
          />
          <line
            x1='3.5'
            y1='10.5'
            x2='10.5'
            y2='3.5'
            stroke={color}
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </>
      )}
      {status === 'scheduled' && (
        <>
          <circle
            cx='7'
            cy='7'
            r='4.5'
            stroke={color}
            strokeWidth='1.5'
            fill='none'
          />
          <line
            x1='7'
            y1='4'
            x2='7'
            y2='7'
            stroke={color}
            strokeWidth='1.5'
            strokeLinecap='round'
          />
          <line
            x1='7'
            y1='7'
            x2='9.5'
            y2='7'
            stroke={color}
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </>
      )}
      {status === 'draft' && (
        <circle
          cx='7'
          cy='7'
          r='4.5'
          stroke={color}
          strokeWidth='1.5'
          strokeDasharray='2 2'
          fill='none'
        />
      )}
      {status === 'archived' && (
        <>
          <circle
            cx='7'
            cy='7'
            r='4.5'
            stroke={color}
            strokeWidth='1.5'
            fill='none'
          />
          <line
            x1='3'
            y1='11'
            x2='11'
            y2='3'
            stroke={color}
            strokeWidth='1.5'
            strokeLinecap='round'
          />
        </>
      )}
    </svg>
  );
}
