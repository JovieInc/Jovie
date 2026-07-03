'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

import { cn } from '../lib/utils';

type ProgressSize = 'sm' | 'md';

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Completion percentage, 0–100. Values outside the range are clamped.
   */
  readonly value: number;
  /**
   * Optional label rendered above the bar (left side).
   * Use for "Importing releases", "Uploading track", etc.
   */
  readonly label?: ReactNode;
  /**
   * Show the numeric percent on the right of the label row.
   * @default true
   */
  readonly showValue?: boolean;
  /**
   * Track height.
   * @default 'md'
   */
  readonly size?: ProgressSize;
  /**
   * Accessible name used when no visible `label` is provided.
   * @default 'Progress'
   */
  readonly ariaLabel?: string;
}

const trackHeight: Record<ProgressSize, string> = {
  sm: 'h-1',
  md: 'h-2',
};

const clampPercent = (value: number): number => {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

/**
 * Canonical determinate progress bar for long-running actions
 * (uploads, imports). Shows a percent and an optional label slot.
 *
 * Loading-state contract (see docs/LOADING_STATES.md):
 * use a ProgressBar only when real percent is known. For predictable
 * page/list loads use `Skeleton`; for in-flight buttons/actions use
 * `Spinner`. Never mix (no spinner inside a skeleton).
 *
 * Keep `label`/`showValue` stable for a mounted instance — toggling
 * either flips the header row on/off and would shift the track. Reset
 * with a `key` remount if the header composition must change.
 *
 * @example
 * ```tsx
 * <ProgressBar value={62} label="Importing releases" />
 * <ProgressBar value={40} size="sm" ariaLabel="Upload progress" showValue={false} />
 * ```
 */
export function ProgressBar({
  value,
  label,
  showValue = true,
  size = 'md',
  ariaLabel = 'Progress',
  className,
  ...rest
}: ProgressBarProps) {
  const percent = clampPercent(value);
  const hasLabel = label != null;
  const showHeader = hasLabel || showValue;
  const labelId = useId();

  return (
    <div className={cn('w-full', className)} {...rest}>
      {showHeader && (
        <div className='mb-1 flex items-center justify-between gap-2 text-sm'>
          <span
            id={hasLabel ? labelId : undefined}
            className='text-secondary-token'
          >
            {label}
          </span>
          {showValue && (
            <span className='text-tertiary-token tabular-nums'>{percent}%</span>
          )}
        </div>
      )}
      <div
        role='progressbar'
        aria-label={hasLabel ? undefined : ariaLabel}
        aria-labelledby={hasLabel ? labelId : undefined}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'w-full overflow-hidden rounded-full bg-surface-2',
          trackHeight[size]
        )}
      >
        <div
          className={cn(
            'h-full rounded-full bg-accent',
            'transition-[width] duration-normal ease-out motion-reduce:transition-none'
          )}
          // Inline width is dynamic data (clamped 0–100), not a static design
          // value — do not convert to an arbitrary Tailwind class.
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
