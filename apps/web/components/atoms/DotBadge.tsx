'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DotBadgeVariant {
  className: string;
  dotClassName: string;
}

export interface DotBadgeProps {
  /** Text label to display */
  label: ReactNode;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Style variant with className and dotClassName */
  variant: DotBadgeVariant;
  /** Optional title for accessibility */
  title?: string;
  /** Additional class names */
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-[11px]',
} as const;

const DOT_SIZE_CLASSES = {
  sm: 'size-1',
  md: 'size-1.5',
} as const;

/**
 * DotBadge - Reusable badge component with a colored dot indicator.
 *
 * Used as the base for ConfidenceBadge, MatchStatusBadge, and AudienceIntentBadge.
 *
 * @example
 * ```tsx
 * <DotBadge
 *   label="High"
 *   variant={{ className: 'border-success bg-success-subtle text-success', dotClassName: 'bg-success' }}
 * />
 * ```
 */
export function DotBadge({
  label,
  size = 'md',
  variant,
  title,
  className,
}: DotBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full border font-medium tracking-wide',
        SIZE_CLASSES[size],
        variant.className,
        className
      )}
      title={title}
    >
      <span
        aria-hidden
        className={cn(
          'mr-1.5 inline-block shrink-0 rounded-full',
          DOT_SIZE_CLASSES[size],
          variant.dotClassName
        )}
      />
      {label}
    </span>
  );
}
