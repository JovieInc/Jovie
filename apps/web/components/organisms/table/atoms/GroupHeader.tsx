'use client';

import React from 'react';
import { cn, presets, typography } from '../table.styles';

interface GroupHeaderProps {
  /**
   * Label for the group (e.g., "New", "Invited", "Jan 2025")
   */
  label: string;

  /**
   * Number of items in this group
   */
  count: number;

  /**
   * Number of columns the header should span
   */
  colSpan: number;

  /**
   * Whether this header is currently sticky
   */
  isSticky?: boolean;

  /**
   * Additional CSS classes
   */
  className?: string;
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
        <div className='flex items-center gap-2 px-4 py-2'>
          <span className={typography.groupHeader}>
            {label} <span className='text-secondary-token'>({count})</span>
          </span>
        </div>
      </td>
    </tr>
  );
});
