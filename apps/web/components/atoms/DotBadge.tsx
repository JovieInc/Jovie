'use client';

import { Badge } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DotBadgeVariant {
  className: string;
  dotClassName: string;
}

export interface DotBadgeProps {
  /** Text label to display */
  readonly label: ReactNode;
  /** Size variant */
  readonly size?: 'sm' | 'md';
  /** Style variant with className and dotClassName */
  readonly variant: DotBadgeVariant;
  /** Optional title for accessibility */
  readonly title?: string;
  /** Additional class names */
  readonly className?: string;
}

const SIZE_CLASSES = {
  sm: 'min-h-[20px] px-1.5 py-0.5 text-[10px]',
  md: 'min-h-[22px] px-2 py-0.5 text-[11px]',
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
    <Badge
      variant='outline'
      className={cn(
        'w-fit whitespace-nowrap shadow-none tracking-[-0.01em]',
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
    </Badge>
  );
}
