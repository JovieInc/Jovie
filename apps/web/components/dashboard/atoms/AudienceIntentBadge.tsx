'use client';

import { DotBadge, type DotBadgeVariant } from '@/components/atoms/DotBadge';
import type { AudienceIntentLevel } from '@/types';

export interface AudienceIntentBadgeProps {
  readonly intentLevel: AudienceIntentLevel;
  readonly className?: string;
}

const INTENT_BADGES: Record<
  AudienceIntentLevel,
  { label: string } & DotBadgeVariant
> = {
  high: {
    label: 'High',
    className: 'border border-subtle bg-surface-2/40 text-secondary-token',
    dotClassName: 'bg-secondary-token',
  },
  medium: {
    label: 'Medium',
    className: 'border border-subtle bg-transparent text-tertiary-token',
    dotClassName: 'bg-tertiary-token',
  },
  low: {
    label: 'Low',
    className: 'border border-subtle bg-transparent text-tertiary-token',
    dotClassName: 'bg-tertiary-token/60',
  },
};

/**
 * AudienceIntentBadge - Displays the intent level of an audience segment.
 *
 * @example
 * <AudienceIntentBadge intentLevel="high" />
 */
export function AudienceIntentBadge({
  intentLevel,
  className,
}: AudienceIntentBadgeProps) {
  const badge = INTENT_BADGES[intentLevel];

  return <DotBadge label={badge.label} variant={badge} className={className} />;
}
