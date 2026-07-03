'use client';

import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export interface ProgressBarProps {
  /** Progress value from 0 to 100. */
  readonly value: number;
  readonly className?: string;
  readonly trackClassName?: string;
  readonly fillClassName?: string;
  /** Optional label rendered above the track (e.g. percent or status copy). */
  readonly label?: ReactNode;
  readonly 'aria-label'?: string;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Determinate progress bar for long uploads and imports.
 * Pair with percent copy in `label`; never mix with Skeleton or Spinner.
 */
export function ProgressBar({
  value,
  className,
  trackClassName,
  fillClassName,
  label,
  'aria-label': ariaLabel = 'Progress',
}: ProgressBarProps) {
  const progress = clampProgress(value);

  return (
    <div className={cn('w-full', className)} data-testid='progress-bar'>
      {label ? (
        <div className='mb-1 text-2xs text-tertiary-token tabular-nums'>
          {label}
        </div>
      ) : null}
      <div
        className={cn(
          'h-1 w-full overflow-hidden rounded-full bg-surface-1',
          trackClassName
        )}
        role='progressbar'
        aria-label={ariaLabel}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full bg-accent transition-[width] duration-subtle ease-out motion-reduce:transition-none',
            fillClassName
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}