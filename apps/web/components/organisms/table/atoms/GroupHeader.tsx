'use client';

import React from 'react';
import { cn, presets, typography } from '../table.styles';

interface GroupHeaderProps {
  /**
   * Label for the group (e.g., "New", "Invited", "Jan 2025")
   */
  readonly label: string;

  /**
   * Number of items in this group
   */
  readonly count: number;

  /**
   * Number of columns the header should span
   */
  readonly colSpan: number;

  /**
   * Whether this header is currently sticky
   */
  readonly isSticky?: boolean;

  /**
   * Additional CSS classes
   */
  readonly className?: string;
}

/**
 * GroupHeader - Sticky group header row for table grouping
 *
 * Features:
 * - Sticky positioning that sticks to top while scrolling
 * - Disappears when next group header reaches top (handled by parent)
 * - Clean visual separation with bold border
 */
export const GroupHeader = React.forwardRef<
  HTMLTableRowElement,
  GroupHeaderProps
>(function GroupHeader(
  { label, count, colSpan, isSticky = true, className },
  ref
) {
  return (
    <tr
      ref={ref}
      className={cn(
        presets.stickyGroupHeader,
        isSticky && 'sticky top-0',
        className
      )}
    >
      <td colSpan={colSpan}>
        <div className='flex items-center gap-2 pl-5 pr-4 py-2'>
          <span className={typography.groupHeader}>
            {label} <span className='text-secondary-token'>({count})</span>
          </span>
        </div>
      </td>
    </tr>
  );
});
