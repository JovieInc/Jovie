'use client';

import { cn } from '@/lib/utils';

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
  { label: string; className: string; dotClassName: string }
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
      title={`${percentage}% confidence`}
    >
      <span
        aria-hidden
        className={cn(
          'mr-1.5 inline-block shrink-0 rounded-full',
          size === 'sm' ? 'size-1' : 'size-1.5',
          style.dotClassName
        )}
      />
      <span>{percentage}%</span>
      {showLabel && <span className='ml-1'>{style.label}</span>}
    </span>
  );
}

export { getConfidenceLevel, CONFIDENCE_THRESHOLDS };
