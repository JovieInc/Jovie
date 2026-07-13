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
    className: 'border-default bg-surface-1 text-secondary-token',
    dotClassName: 'bg-(--linear-text-secondary)',
  },
  medium: {
    label: 'Medium',
    className: 'border-subtle bg-surface-0 text-tertiary-token',
    dotClassName: 'bg-(--linear-text-tertiary)',
  },
  low: {
    label: 'Low',
    className: 'border-subtle bg-transparent text-tertiary-token',
    dotClassName: 'bg-(--linear-text-tertiary)/70',
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
