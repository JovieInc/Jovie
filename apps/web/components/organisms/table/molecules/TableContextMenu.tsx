'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import type React from 'react';
import {
  cloneElement,
  isValidElement,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu/types';
import { logger } from '@/lib/utils/logger';

/**
 * A single action item in the context menu
 */
export interface ContextMenuAction {
  /** Unique identifier for the action */
  readonly id: string;
  /** Display label for the action */
  readonly label: string;
  /** Optional icon element to display before the label */
  readonly icon?: ReactNode;
  /** Callback function to execute when the action is clicked */
  readonly onClick: () => void;
  /** Whether this action is destructive (e.g., delete, remove). Uses red styling. */
  readonly destructive?: boolean;
  /** Whether this action is disabled and cannot be clicked */
  readonly disabled?: boolean;
  /** Optional trailing helper text */
  readonly subText?: string;
}

/**
 * A submenu containing nested context menu items
 */
export interface ContextMenuSubmenu {
  /** Unique identifier for the submenu */
  readonly id: string;
  /** Display label for the submenu */
  readonly label: string;
  /** Optional icon element to display before the label */
  readonly icon?: ReactNode;
  /** Array of nested items within this submenu */
  readonly items: ContextMenuItemType[];
  /** Whether this submenu is disabled */
  readonly disabled?: boolean;
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
  readonly children: ReactNode;
  /** Array of menu items to display in the context menu */
  readonly items?: ContextMenuItemType[];
  /** Lazily resolve menu items when the context menu is opened */
  readonly getItems?: () =>
    | ContextMenuItemType[]
    | Promise<ContextMenuItemType[]>;
  /** Whether the context menu is disabled */
  readonly disabled?: boolean;
}

function isSeparator(item: ContextMenuItemType): item is { type: 'separator' } {
  return 'type' in item && item.type === 'separator';
}

function isSubmenu(item: ContextMenuItemType): item is ContextMenuSubmenu {
  return 'items' in item && Array.isArray(item.items);
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof (value as PromiseLike<T>).then === 'function';
}

function resolveAsyncContextMenuItems(
  promise: PromiseLike<ContextMenuItemType[]>,
  targetGeneration: number,
  setResolveGeneration: React.Dispatch<React.SetStateAction<number>>,
  setResolvedItems: React.Dispatch<React.SetStateAction<ContextMenuItemType[]>>
) {
  void Promise.resolve(promise)
    .then(loadedItems => {
      setResolveGeneration(activeGeneration => {
        if (activeGeneration === targetGeneration) {
          setResolvedItems(loadedItems);
        }
        return activeGeneration;
      });
    })
    .catch(error => {
      setResolveGeneration(activeGeneration => {
        if (activeGeneration === targetGeneration) {
          logger.warn(
            'Failed to resolve async context menu items',
            error,
            'TableContextMenu'
          );
          setResolvedItems([]);
        }
        return activeGeneration;
      });
    });
}

function normalizeContextMenuItems(
  items: readonly ContextMenuItemType[]
): ContextMenuItemType[] {
  const normalized: ContextMenuItemType[] = [];

  for (const item of items) {
    if (isSeparator(item)) {
      if (normalized.length === 0 || isSeparator(normalized.at(-1)!)) {
        continue;
      }

      normalized.push(item);
      continue;
    }

    if (isSubmenu(item)) {
      const children = normalizeContextMenuItems(item.items);

      if (children.length === 0) {
        continue;
      }

      normalized.push({
        ...item,
        items: children,
      });
      continue;
    }

    normalized.push(item);
  }

  while (normalized.length > 0 && isSeparator(normalized.at(-1)!)) {
    normalized.pop();
  }

  return normalized;
}

function toTableActionMenuItems(
  items: readonly ContextMenuItemType[],
  path = 'context'
): TableActionMenuItem[] {
  return normalizeContextMenuItems(items).map((item, index) => {
    if (isSeparator(item)) {
      return {
        id: `separator-${path}-${index}`,
        label: '',
        onClick: () => {},
      };
    }

    if (isSubmenu(item)) {
      return {
        id: item.id,
        label: item.label,
        icon: item.icon,
        disabled: item.disabled,
        children: toTableActionMenuItems(item.items, `${path}-${item.id}`),
      };
    }

    return {
      id: item.id,
      label: item.label,
      icon: item.icon,
      onClick: item.onClick,
      disabled: item.disabled,
      variant: item.destructive ? ('destructive' as const) : undefined,
      subText: item.subText,
    };
  });
}

function toCommonDropdownItems(
  items: readonly ContextMenuItemType[],
  path = 'context'
): CommonDropdownItem[] {
  return normalizeContextMenuItems(items).map((item, index) => {
    if (isSeparator(item)) {
      return {
        type: 'separator' as const,
        id: `sep-${path}-${index}`,
      };
    }

    if (isSubmenu(item)) {
      return {
        type: 'submenu' as const,
        id: item.id,
        label: item.label,
        icon: item.icon,
        disabled: item.disabled,
        items: toCommonDropdownItems(item.items, `${path}-${item.id}`),
      };
    }

    return {
      type: 'action' as const,
      id: item.id,
      label: item.label,
      icon: item.icon,
      onClick: item.onClick,
      disabled: item.disabled,
      variant: item.destructive ? ('destructive' as const) : undefined,
      subText: item.subText,
    };
  });
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
 *       items: [
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
  return toTableActionMenuItems(items);
}

export function TableContextMenu({
  children,
  items,
  getItems,
  disabled = false,
}: TableContextMenuProps) {
  const [resolvedItems, setResolvedItems] = useState<ContextMenuItemType[]>(
    items ?? []
  );
  const [_resolveGeneration, setResolveGeneration] = useState(0);

  useEffect(() => {
    if (!getItems) {
      setResolvedItems(items ?? []);
    }
  }, [getItems, items]);

  const resolveItems = useCallback(() => {
    if (!getItems) {
      setResolveGeneration(current => current + 1);
      setResolvedItems(items ?? []);
      return;
    }

    const nextItems = getItems();

    if (isPromiseLike(nextItems)) {
      setResolvedItems([
        {
          id: 'loading',
          label: 'Loading...',
          onClick: () => {},
          disabled: true,
        },
      ]);

      setResolveGeneration(currentGeneration => {
        const nextGeneration = currentGeneration + 1;
        resolveAsyncContextMenuItems(
          nextItems,
          nextGeneration,
          setResolveGeneration,
          setResolvedItems
        );
        return nextGeneration;
      });

      return;
    }

    setResolveGeneration(current => current + 1);
    setResolvedItems(nextItems);
  }, [getItems, items]);

  // Memoize conversion to prevent recalculation on every render
  const convertedItems = useMemo(
    () => convertContextMenuItems(resolvedItems),
    [resolvedItems]
  );

  if (disabled || (!getItems && resolvedItems.length === 0)) {
    return <>{children}</>;
  }

  let triggerChild = children;

  if (getItems && isValidElement(children)) {
    const contextMenuChild = children as ReactElement<{
      onContextMenuCapture?: MouseEventHandler<Element>;
    }>;
    const originalOnContextMenuCapture =
      contextMenuChild.props.onContextMenuCapture;

    triggerChild = cloneElement(contextMenuChild, {
      onContextMenuCapture: event => {
        originalOnContextMenuCapture?.(event);
        resolveItems();
      },
    });
  }

  return (
    <TableActionMenu items={convertedItems} trigger='context'>
      {triggerChild}
    </TableActionMenu>
  );
}

/**
 * Convert ContextMenuItemType[] to CommonDropdownItem[]
 * Used to share the same menu items between table rows and RightDrawer sidebars
 */
export function convertToCommonDropdownItems(
  items: ContextMenuItemType[]
): CommonDropdownItem[] {
  return toCommonDropdownItems(items);
}
