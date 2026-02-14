'use client';

import { Check, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AvatarUploadStatus = 'idle' | 'uploading' | 'success' | 'error';

const STROKE_WIDTH = 3;
const RADIUS = 50 - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STATUS_COLORS = {
  uploading: 'text-accent',
  success: 'text-success',
  error: 'text-destructive',
  idle: 'text-secondary-token',
} as const;

export interface AvatarProgressRingProps {
  readonly progress: number;
  readonly size: number;
  readonly status: AvatarUploadStatus;
}

export function AvatarProgressRing({
  progress,
  size,
  status,
}: AvatarProgressRingProps) {
  const strokeDasharray = `${(progress / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  const ringColor = STATUS_COLORS[status];

  return (
    <div
      className='pointer-events-none absolute inset-0 flex items-center justify-center'
      aria-hidden='true'
      data-testid='avatar-uploadable-progress'
    >
      <svg
        width={size}
        height={size}
        viewBox='0 0 100 100'
        className='-rotate-90'
        aria-hidden='true'
      >
        {/* Background ring */}
        <circle
          cx='50'
          cy='50'
          r={RADIUS}
          fill='none'
          stroke='currentColor'
          strokeWidth={STROKE_WIDTH}
          className='text-border-subtle'
        />
        {/* Progress ring */}
        <circle
          cx='50'
          cy='50'
          r={RADIUS}
          fill='none'
          stroke='currentColor'
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={strokeDasharray}
          strokeLinecap='round'
          className={cn(
            'stroke-current transition-all duration-300 ease-out',
            ringColor
          )}
        />
      </svg>

      {/* Status icons */}
      <div className='absolute inset-0 flex items-center justify-center'>
        {status === 'success' && (
          <div className='rounded-full bg-surface-0 text-success ring-1 ring-success/20 shadow-sm transition-all duration-200 ease-out animate-in fade-in zoom-in motion-reduce:animate-none'>
            <Check size={size * 0.15} className='p-1' aria-hidden='true' />
          </div>
        )}
        {status === 'error' && (
          <div className='rounded-full bg-surface-0 text-destructive ring-1 ring-destructive/20 shadow-sm transition-all duration-200 ease-out animate-in fade-in zoom-in motion-reduce:animate-none'>
            <X size={size * 0.15} className='p-1' aria-hidden='true' />
          </div>
        )}
        {status === 'uploading' && (
          <div className='rounded-full bg-accent text-accent-foreground ring-1 ring-accent/20 shadow-sm animate-pulse motion-reduce:animate-none transition-all duration-200 ease-out'>
            <Upload size={size * 0.15} className='p-1' aria-hidden='true' />
          </div>
        )}
      </div>
    </div>
  );
}
