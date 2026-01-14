'use client';

import type { ReactNode } from 'react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';

/**
 * A single action item in the context menu
 */
export interface ContextMenuAction {
  /** Unique identifier for the action */
  id: string;
  /** Display label for the action */
  label: string;
  /** Optional icon element to display before the label */
  icon?: ReactNode;
  /** Callback function to execute when the action is clicked */
  onClick: () => void;
  /** Whether this action is destructive (e.g., delete, remove). Uses red styling. */
  destructive?: boolean;
  /** Whether this action is disabled and cannot be clicked */
  disabled?: boolean;
}

/**
 * A submenu containing multiple actions
 * @deprecated Not yet fully supported - will be flattened to regular actions
 */
export interface ContextMenuSubmenu {
  /** Unique identifier for the submenu */
  id: string;
  /** Display label for the submenu */
  label: string;
  /** Optional icon element to display before the label */
  icon?: ReactNode;
  /** Array of actions within this submenu */
  actions: ContextMenuAction[];
}

/**
 * Union type representing all possible context menu item types
 */
export type ContextMenuItemType =
  | ContextMenuAction
  | { type: 'separator' }
  | ContextMenuSubmenu;

/**
 * Props for TableContextMenu component
 */
export interface TableContextMenuProps {
  /** React children to wrap with context menu functionality */
  children: ReactNode;
  /** Array of menu items to display in the context menu */
  items: ContextMenuItemType[];
  /** Whether the context menu is disabled */
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
        id: 'separator', // Must be exactly 'separator' for TableActionMenu to recognize it
        label: '', // Empty label, will be rendered as separator component
        onClick: () => {}, // Required by type, but unused for separators
      };
    }

    if (isSubmenu(item)) {
      // TODO: Implement nested submenu support in TableActionMenuItem
      // Context: Currently TableActionMenuItem only supports flat menu structures.
      // We need to extend TableActionMenuItem type to support nested submenus.
      // This would require:
      // 1. Add submenu support to TableActionMenu component
      // 2. Update TableActionMenuItem type to include optional submenu array
      // 3. Update menu rendering logic to handle nested menus
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
