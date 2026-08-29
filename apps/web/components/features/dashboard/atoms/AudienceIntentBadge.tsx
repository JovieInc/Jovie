'use client';

import { DotBadge } from '@/components/atoms/DotBadge';
import type { AudienceIntentLevel } from '@/types';
import { AUDIENCE_INTENT_BADGE_STYLES } from './dashboard-status-badge-semantic-contract';

export interface AudienceIntentBadgeProps {
  readonly intentLevel: AudienceIntentLevel;
  readonly className?: string;
}

/**
 * AudienceIntentBadge - Displays the intent level of an audience segment.
 *
 * Semantic roles are source-backed. Pill geometry and nowrap live on DotBadge.
 *
 * @example
 * <AudienceIntentBadge intentLevel="high" />
 */
export function AudienceIntentBadge({
  intentLevel,
  className,
}: AudienceIntentBadgeProps) {
  const badge = AUDIENCE_INTENT_BADGE_STYLES[intentLevel];

  return <DotBadge label={badge.label} variant={badge} className={className} />;
}
