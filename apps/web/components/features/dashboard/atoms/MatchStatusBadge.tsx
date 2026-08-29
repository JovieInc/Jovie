'use client';

import { DotBadge } from '@/components/atoms/DotBadge';
import type { DspMatchStatus } from '@/lib/dsp-enrichment/types';
import { MATCH_STATUS_BADGE_STYLES } from './dashboard-status-badge-semantic-contract';

export interface MatchStatusBadgeProps {
  readonly status: DspMatchStatus;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

/**
 * MatchStatusBadge - Displays the status of a DSP artist match.
 *
 * Statuses:
 * - Suggested (blue): Awaiting user confirmation
 * - Confirmed (green): User verified the match
 * - Auto-confirmed (green): System auto-approved high-confidence match
 * - Rejected (gray): User rejected the match
 *
 * Semantic roles are source-backed. Pill geometry and nowrap live on DotBadge.
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
  const style = MATCH_STATUS_BADGE_STYLES[status];

  return (
    <DotBadge
      label={style.label}
      size={size}
      variant={style}
      className={className}
    />
  );
}
