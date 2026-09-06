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
  const ratio = (value - min) / (max - min);
  return Math.min(100, Math.max(0, ratio * 100));
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const hasValidRange =
    Number.isFinite(min) && Number.isFinite(max) && max > min;
  const hasDeterminateValue =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    hasValidRange &&
    !indeterminate;
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100;
  const currentValue = hasDeterminateValue
    ? clampValue(value, safeMin, safeMax)
    : undefined;
  const percent =
    currentValue === undefined
      ? 0
      : clampPercent(currentValue, safeMin, safeMax);
  const state = hasDeterminateValue ? 'determinate' : 'indeterminate';
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
        aria-valuemin={safeMin}
        aria-valuemax={safeMax}
        aria-valuenow={currentValue === undefined ? undefined : currentValue}
        aria-valuetext={
          hasDeterminateValue ? `${Math.round(percent)}%` : undefined
        }
        data-part='track'
        data-state={state}
        className={cn(
          'h-1.5 w-full overflow-hidden rounded-full bg-surface-2',
          trackClassName
        )}
      >
        <div
          data-part='indicator'
          data-state={state}
          className={cn(
            'h-full rounded-full bg-accent transition-[width] duration-subtle ease-subtle motion-reduce:transition-none',
            !hasDeterminateValue &&
              'w-1/3 animate-progress-indeterminate motion-reduce:animate-none',
            fillClassName
          )}
          style={hasDeterminateValue ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
}
