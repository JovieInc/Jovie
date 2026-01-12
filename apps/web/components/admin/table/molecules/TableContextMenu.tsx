'use client';

import type { ReactNode } from 'react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ContextMenuSubmenu {
  id: string;
  label: string;
  icon?: ReactNode;
  actions: ContextMenuAction[];
}

export type ContextMenuItemType =
  | ContextMenuAction
  | { type: 'separator' }
  | ContextMenuSubmenu;

export interface TableContextMenuProps {
  children: ReactNode;
  items: ContextMenuItemType[];
  disabled?: boolean;
}

function isAction(item: ContextMenuItemType): item is ContextMenuAction {
  return 'onClick' in item && typeof item.onClick === 'function';
}

function isSeparator(item: ContextMenuItemType): item is { type: 'separator' } {
  return 'type' in item && item.type === 'separator';
}

function isSubmenu(item: ContextMenuItemType): item is ContextMenuSubmenu {
  return 'actions' in item && Array.isArray(item.actions);
}

/**
 * TableContextMenu - Right-click context menu for table rows
 *
 * Now a thin wrapper around TableActionMenu using the context variant.
 * This ensures the right-click menu and ellipsis button menu are identical.
 *
 * @example
 * ```tsx
 * <TableContextMenu
 *   items={[
 *     { id: 'edit', label: 'Edit', icon: <PencilIcon />, onClick: handleEdit },
 *     {
 *       id: 'copy',
 *       label: 'Copy',
 *       icon: <CopyIcon />,
 *       actions: [
 *         { id: 'copy-id', label: 'Copy ID', onClick: () => copy(row.id) },
 *         { id: 'copy-name', label: 'Copy Name', onClick: () => copy(row.name) },
 *       ],
 *     },
 *     { type: 'separator' },
 *     { id: 'delete', label: 'Delete', destructive: true, onClick: handleDelete },
 *   ]}
 * >
 *   <TableRow>{...}</TableRow>
 * </TableContextMenu>
 * ```
 */
/**
 * Convert ContextMenuItemType to TableActionMenuItem
 * Exported so tables can use the same items for both ellipsis button and right-click menu
 */
export function convertContextMenuItems(
  items: ContextMenuItemType[]
): TableActionMenuItem[] {
  return items.map((item, index) => {
    if (isSeparator(item)) {
      return {
        id: `separator-${index}`,
        label: 'separator',
        onClick: () => {}, // Required by type, but unused for separators
      };
    }

    if (isSubmenu(item)) {
      // TODO: Implement submenu support in TableActionMenuItem
      // For now, flatten submenu items into regular actions with prefixed labels
      console.warn(
        `Submenu "${item.label}" is not yet supported - flattening to regular items`
      );
      // Return a separator with the submenu label as a placeholder
      return {
        id: item.id,
        label: `${item.label} (submenu not supported)`,
        onClick: () => {},
        disabled: true,
      };
    }

    if (isAction(item)) {
      return {
        id: item.id,
        label: item.label,
        icon: item.icon,
        onClick: item.onClick,
        disabled: item.disabled,
        variant: item.destructive ? ('destructive' as const) : undefined,
      };
    }

    // Fallback (should never happen)
    return {
      id: `unknown-${index}`,
      label: 'Unknown',
      onClick: () => {},
    };
  });
}

export function TableContextMenu({
  children,
  items,
  disabled = false,
}: TableContextMenuProps) {
  if (disabled || items.length === 0) {
    return <>{children}</>;
  }

  const convertedItems = convertContextMenuItems(items);

  return (
    <TableActionMenu items={convertedItems} trigger='context'>
      {children}
    </TableActionMenu>
  );
}
