'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@jovie/ui';
import type { ReactNode } from 'react';

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
 * Provides a reusable context menu system with support for:
 * - Simple actions
 * - Submenus (e.g., "Copy >" with multiple copy options)
 * - Separators
 * - Destructive actions
 * - Disabled states
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
export function TableContextMenu({
  children,
  items,
  disabled = false,
}: TableContextMenuProps) {
  if (disabled || items.length === 0) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className='w-48 text-xs'>
        {items.map((item, index) => {
          if (isSeparator(item)) {
            return <ContextMenuSeparator key={`separator-${index}`} />;
          }

          if (isAction(item)) {
            return (
              <ContextMenuItem
                key={item.id}
                onClick={item.onClick}
                disabled={item.disabled}
                className={
                  item.destructive
                    ? 'text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400 text-xs'
                    : 'text-xs'
                }
              >
                {item.icon && (
                  <span className='mr-2 h-3.5 w-3.5 flex items-center justify-center'>
                    {item.icon}
                  </span>
                )}
                {item.label}
              </ContextMenuItem>
            );
          }

          if (isSubmenu(item)) {
            return (
              <ContextMenuSub key={item.id}>
                <ContextMenuSubTrigger className='text-xs'>
                  {item.icon && (
                    <span className='mr-2 h-3.5 w-3.5 flex items-center justify-center'>
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className='text-xs'>
                  {item.actions.map(action => (
                    <ContextMenuItem
                      key={action.id}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className={
                        action.destructive
                          ? 'text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400 text-xs'
                          : 'text-xs'
                      }
                    >
                      {action.icon && (
                        <span className='mr-2 h-3.5 w-3.5 flex items-center justify-center'>
                          {action.icon}
                        </span>
                      )}
                      {action.label}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            );
          }

          return null;
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}
