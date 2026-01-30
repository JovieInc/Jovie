'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo } from 'react';
import { cn } from '@/lib/utils';

/** Standard empty marker (em dash) */
const EMPTY_MARKER = '—';

interface EmptyCellProps {
  /** Optional tooltip explaining why the value is empty */
  readonly tooltip?: string;
  /** Additional class names */
  readonly className?: string;
}

/**
 * EmptyCell - Consistent empty state marker for table cells
 *
 * Uses an em dash (—) as the standard empty value indicator.
 * Optional tooltip to explain why the value is missing.
 *
 * @example
 * // Simple empty marker
 * <EmptyCell />
 *
 * @example
 * // With explanatory tooltip
 * <EmptyCell tooltip="No release date set" />
 */
export const EmptyCell = memo(function EmptyCell({
  tooltip,
  className,
}: EmptyCellProps) {
  const content = (
    <span className={cn('text-xs text-tertiary-token', className)}>
      {EMPTY_MARKER}
    </span>
  );

  if (!tooltip) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
});
