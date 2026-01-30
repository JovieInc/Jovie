'use client';

import { cn } from '@/lib/utils';

export interface TableCountBadgeProps {
  /** Number of selected items (if any) */
  readonly selectedCount?: number;
  /** Total number of items */
  readonly totalCount: number;
  /** Visual variant */
  readonly variant?: 'pill' | 'text';
  /** Additional CSS classes */
  readonly className?: string;
}

/**
 * Unified count badge for table toolbars.
 *
 * Shows "X selected" when items are selected, otherwise shows "X total".
 * Two variants:
 * - "pill" (default): Rounded pill with background
 * - "text": Plain text styling
 *
 * @example
 * // Pill variant (default)
 * <TableCountBadge selectedCount={5} totalCount={100} />
 *
 * @example
 * // Text variant
 * <TableCountBadge selectedCount={5} totalCount={100} variant="text" />
 */
export function TableCountBadge({
  selectedCount = 0,
  totalCount,
  variant = 'pill',
  className,
}: TableCountBadgeProps) {
  const hasSelection = selectedCount > 0;
  const displayText = hasSelection
    ? `${selectedCount} selected`
    : `${totalCount} total`;

  if (variant === 'text') {
    return (
      <span className={cn('text-sm font-medium text-primary-token', className)}>
        {displayText}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium tabular-nums text-primary-token',
        className
      )}
    >
      {displayText}
    </span>
  );
}
