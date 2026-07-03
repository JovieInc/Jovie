'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export interface ProgressBarProps {
  /** Progress value from 0–100. Omit for indeterminate mode. */
  readonly value?: number;
  readonly min?: number;
  readonly max?: number;
  readonly label?: string;
  /** Accessible name when no visible label is rendered */
  readonly 'aria-label'?: string;
  readonly showValue?: boolean;
  readonly indeterminate?: boolean;
  readonly className?: string;
  readonly trackClassName?: string;
  readonly fillClassName?: string;
  readonly children?: React.ReactNode;
}

function clampPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const ratio = (value - min) / (max - min);
  return Math.min(100, Math.max(0, ratio * 100));
}

/**
 * Progress bar for long uploads and imports. Pair with a label slot; never
 * replace page skeletons or inline button spinners with this component.
 */
export function ProgressBar({
  value,
  min = 0,
  max = 100,
  label,
  'aria-label': ariaLabel,
  showValue = false,
  indeterminate = false,
  className,
  trackClassName,
  fillClassName,
  children,
}: ProgressBarProps) {
  const hasDeterminateValue = typeof value === 'number' && !indeterminate;
  const percent = hasDeterminateValue ? clampPercent(value, min, max) : 0;
  const progressAriaLabel =
    ariaLabel ??
    label ??
    (hasDeterminateValue ? `${Math.round(percent)}%` : 'Loading');

  const showHeader =
    Boolean(label) || Boolean(children) || (showValue && hasDeterminateValue);

  return (
    <div className={cn('space-y-1.5', className)}>
      {showHeader ? (
        <div className='flex items-center justify-between gap-2 text-sm'>
          {label ? (
            <span className='min-w-0 truncate font-medium text-primary-token'>
              {label}
            </span>
          ) : (
            children
          )}
          {showValue && hasDeterminateValue ? (
            <span className='shrink-0 tabular-nums text-tertiary-token'>
              {Math.round(percent)}%
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        role='progressbar'
        aria-label={progressAriaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={hasDeterminateValue ? Math.round(percent) : undefined}
        className={cn(
          'h-1 w-full overflow-hidden rounded-full bg-surface-2',
          trackClassName
        )}
      >
        <div
          data-state={indeterminate || !hasDeterminateValue ? 'indeterminate' : 'determinate'}
          className={cn(
            'h-full rounded-full bg-accent transition-[width] duration-subtle ease-out motion-reduce:transition-none',
            (indeterminate || !hasDeterminateValue) &&
              'w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite] motion-reduce:animate-none',
            fillClassName
          )}
          style={
            hasDeterminateValue && !indeterminate
              ? { width: `${percent}%` }
              : undefined
          }
        />
      </div>
    </div>
  );
}