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
    className: 'border-info/20 bg-surface-1 text-info',
    dotClassName: 'bg-info',
  },
  confirmed: {
    label: 'Confirmed',
    className: 'border-success/20 bg-surface-1 text-success',
    dotClassName: 'bg-success',
  },
  auto_confirmed: {
    label: 'Auto-confirmed',
    className: 'border-success/20 bg-surface-1 text-success',
    dotClassName: 'bg-success',
  },
  rejected: {
    label: 'Rejected',
    className: 'border-subtle bg-surface-1 text-tertiary-token',
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
