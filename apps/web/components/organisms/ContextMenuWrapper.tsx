'use client';

import * as React from 'react';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';

interface ContextMenuWrapperProps {
  menuItems: TableActionMenuItem[];
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * Wraps table rows to provide right-click context menu functionality
 *
 * Keyboard Support:
 * - Shift+F10: Open context menu
 * - Menu key: Open context menu
 * - Arrow keys: Navigate (handled by Radix)
 * - Enter/Space: Activate item (handled by Radix)
 * - Escape: Close (handled by Radix)
 */
export const ContextMenuWrapper = React.memo(
  ({ menuItems, onOpenChange, children }: ContextMenuWrapperProps) => {
    return (
      <TableActionMenu
        items={menuItems}
        trigger='context'
        onOpenChange={onOpenChange}
      >
        {children}
      </TableActionMenu>
    );
  }
);

ContextMenuWrapper.displayName = 'ContextMenuWrapper';
