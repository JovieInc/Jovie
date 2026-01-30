'use client';

import { DotBadge, type DotBadgeVariant } from '@/components/atoms/DotBadge';

export interface ConfidenceBadgeProps {
  score: number; // 0-1 decimal
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

type ConfidenceLevel = 'high' | 'medium' | 'low';

const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
};

const CONFIDENCE_STYLES: Record<
  ConfidenceLevel,
  { label: string } & DotBadgeVariant
> = {
  high: {
    label: 'High',
    className: 'border-success bg-success-subtle text-success',
    dotClassName: 'bg-success',
  },
  medium: {
    label: 'Medium',
    className: 'border-warning bg-warning-subtle text-warning',
    dotClassName: 'bg-warning',
  },
  low: {
    label: 'Low',
    className: 'border-error bg-error-subtle text-error',
    dotClassName: 'bg-error',
  },
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
  const style = CONFIDENCE_STYLES[level];
  const percentage = Math.round(score * 100);

  const label = (
    <>
      <span>{percentage}%</span>
      {showLabel && <span className='ml-1'>{style.label}</span>}
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

export { getConfidenceLevel, CONFIDENCE_THRESHOLDS };
