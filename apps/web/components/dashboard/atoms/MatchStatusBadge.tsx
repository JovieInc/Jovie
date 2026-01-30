'use client';

import { DotBadge, type DotBadgeVariant } from '@/components/atoms/DotBadge';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';

export interface MatchStatusBadgeProps {
  readonly status: DspMatchStatus;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

const STATUS_STYLES: Record<
  DspMatchStatus,
  { label: string } & DotBadgeVariant
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

  return (
    <DotBadge
      label={style.label}
      size={size}
      variant={style}
      className={className}
    />
  );
}
