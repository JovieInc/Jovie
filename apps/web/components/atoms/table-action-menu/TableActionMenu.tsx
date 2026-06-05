'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import { MoreVertical } from 'lucide-react';
import type { TableActionMenuItem, TableActionMenuProps } from './types';
import { isSeparatorItem } from './utils';

const DEFAULT_TRIGGER_CLASS_NAME = [
  'ml-auto',
  'inline-flex h-7 w-7 items-center justify-center',
  'rounded-full border border-transparent bg-transparent',
  'text-tertiary-token transition-colors duration-fast ease-interactive',
  'hover:bg-surface-1 hover:text-primary-token',
  'focus-visible:outline-none focus-visible:bg-surface-1',
  'focus-visible:ring-1 focus-visible:ring-focus/50',
].join(' ');

/**
 * TableActionMenu - Wrapper around CommonDropdown with compact table styling
 *
 * Provides a compact, table-optimized dropdown menu for row actions.
 * Uses CommonDropdown internally with `size="compact"` for dense UI.
 *
 * @example
 * <TableActionMenu
 *   items={[
 *     { id: 'edit', label: 'Edit', icon: Pencil, onClick: handleEdit },
 *     { id: 'separator' },
 *     { id: 'delete', label: 'Delete', icon: Trash2, onClick: handleDelete, variant: 'destructive' },
 *   ]}
 * />
 */
export function TableActionMenu({
  items,
  trigger = 'button',
  triggerIcon: TriggerIcon = MoreVertical,
  align = 'end',
  open,
  onOpenChange,
  children,
}: TableActionMenuProps) {
  const toDropdownItems = (
    menuItems: readonly TableActionMenuItem[],
    path = 'menu'
  ): CommonDropdownItem[] =>
    menuItems.map((item, index) => {
      if (isSeparatorItem(item.id)) {
        return {
          type: 'separator',
          id: `${path}-separator-${index}`,
        };
      }

      if (item.children && item.children.length > 0) {
        return {
          type: 'submenu',
          id: item.id,
          label: item.label,
          icon: item.icon,
          disabled: item.disabled,
          items: toDropdownItems(item.children, `${path}-${item.id}`),
        };
      }

      return {
        type: 'action',
        id: item.id,
        label: item.label,
        icon: item.icon,
        onClick: item.onClick ?? (() => {}),
        disabled: item.disabled,
        variant: item.variant,
        subText: item.subText,
      };
    });

  const dropdownItems = toDropdownItems(items);

  // Context menu variant
  if (trigger === 'context' && children) {
    return (
      <CommonDropdown variant='context' size='compact' items={dropdownItems}>
        {children}
      </CommonDropdown>
    );
  }

  // Custom trigger variant
  if (trigger === 'custom' && children) {
    return (
      <CommonDropdown
        variant='dropdown'
        size='compact'
        items={dropdownItems}
        trigger={children}
        align={align}
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }

  // Default button trigger
  return (
    <CommonDropdown
      variant='dropdown'
      size='compact'
      items={dropdownItems}
      triggerIcon={TriggerIcon}
      align={align}
      open={open}
      onOpenChange={onOpenChange}
      triggerClassName={DEFAULT_TRIGGER_CLASS_NAME}
    />
  );
}
