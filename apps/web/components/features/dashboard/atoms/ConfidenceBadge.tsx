'use client';

import { DotBadge } from '@/components/atoms/DotBadge';
import {
  CONFIDENCE_BADGE_LABEL_GAP_CLASS,
  CONFIDENCE_BADGE_STYLES,
  type ConfidenceLevel,
} from './dashboard-status-badge-semantic-contract';

export interface ConfidenceBadgeProps {
  readonly score: number; // 0-1 decimal
  readonly size?: 'sm' | 'md';
  readonly showLabel?: boolean;
  readonly className?: string;
}

const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
};

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * ConfidenceBadge - Displays a confidence score as a percentage with color coding.
 *
 * Score ranges:
 * - High (≥80%): Green
 * - Medium (50-79%): Amber
 * - Low (<50%): Red
 *
 * Semantic roles are source-backed. Pill geometry and nowrap live on DotBadge.
 *
 * @example
 * <ConfidenceBadge score={0.85} />           // "85%"
 * <ConfidenceBadge score={0.85} showLabel /> // "85% High"
 */
export function ConfidenceBadge({
  score,
  size = 'md',
  showLabel = false,
  className,
}: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(score);
  const style = CONFIDENCE_BADGE_STYLES[level];
  const percentage = Math.round(score * 100);

  const label = (
    <>
      <span>{percentage}%</span>
      {showLabel && (
        <span className={CONFIDENCE_BADGE_LABEL_GAP_CLASS}>{style.label}</span>
      )}
    </>
  );

  return (
    <DotBadge
      label={label}
      size={size}
      variant={style}
      title={`${percentage}% confidence`}
      className={className}
    />
  );
}

export { CONFIDENCE_THRESHOLDS, getConfidenceLevel };
