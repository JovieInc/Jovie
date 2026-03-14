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
    className:
      'border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
    dotClassName: 'bg-(--linear-text-secondary)',
  },
  medium: {
    label: 'Medium',
    className:
      'border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-text-tertiary)',
    dotClassName: 'bg-(--linear-text-tertiary)',
  },
  low: {
    label: 'Low',
    className:
      'border-(--linear-border-subtle) bg-transparent text-(--linear-text-tertiary)',
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
