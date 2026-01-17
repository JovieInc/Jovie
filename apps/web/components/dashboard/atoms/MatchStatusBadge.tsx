'use client';

import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import { cn } from '@/lib/utils';

export interface MatchStatusBadgeProps {
  status: DspMatchStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_STYLES: Record<
  DspMatchStatus,
  { label: string; className: string; dotClassName: string }
> = {
  suggested: {
    label: 'Suggested',
    className:
      'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dotClassName: 'bg-blue-500',
  },
  confirmed: {
    label: 'Confirmed',
    className:
      'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
    dotClassName: 'bg-green-500',
  },
  auto_confirmed: {
    label: 'Auto-confirmed',
    className:
      'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400',
    dotClassName: 'bg-green-500',
  },
  rejected: {
    label: 'Rejected',
    className: 'border-subtle bg-surface-2/40 text-tertiary-token',
    dotClassName: 'bg-tertiary-token',
  },
};

/**
 * MatchStatusBadge - Displays the status of a DSP artist match.
 *
 * Statuses:
 * - Suggested (blue): Awaiting user confirmation
 * - Confirmed (green): User verified the match
 * - Auto-confirmed (green): System auto-approved high-confidence match
 * - Rejected (gray): User rejected the match
 *
 * @example
 * <MatchStatusBadge status="suggested" />
 * <MatchStatusBadge status="confirmed" size="sm" />
 */
export function MatchStatusBadge({
  status,
  size = 'md',
  className,
}: MatchStatusBadgeProps) {
  const style = STATUS_STYLES[status];

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-[11px]',
  };

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full border font-medium tracking-wide',
        sizeClasses[size],
        style.className,
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mr-1.5 inline-block shrink-0 rounded-full',
          size === 'sm' ? 'size-1' : 'size-1.5',
          style.dotClassName
        )}
      />
      {style.label}
    </span>
  );
}
