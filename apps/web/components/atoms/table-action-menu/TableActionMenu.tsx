'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import { MoreVertical } from 'lucide-react';

import type { TableActionMenuProps } from './types';
import { isSeparatorItem } from './utils';

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
  // Convert TableActionMenu items to CommonDropdown items
  const dropdownItems: CommonDropdownItem[] = items.map((item, index) => {
    // Handle separator
    if (isSeparatorItem(item.id)) {
      return {
        type: 'separator',
        id: `separator-${index}`,
      };
    }

    // Handle submenu item
    if (item.children && item.children.length > 0) {
      return {
        type: 'submenu',
        id: item.id,
        label: item.label,
        icon: item.icon,
        items: item.children.map(
          child =>
            ({
              type: 'action',
              id: child.id,
              label: child.label,
              icon: child.icon,
              onClick: child.onClick,
              disabled: child.disabled,
              variant: child.variant,
              subText: child.subText,
            }) as CommonDropdownItem
        ),
      };
    }

    // Handle action item
    return {
      type: 'action',
      id: item.id,
      label: item.label,
      icon: item.icon,
      onClick: item.onClick,
      disabled: item.disabled,
      variant: item.variant,
      subText: item.subText,
    };
  });

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
      triggerClassName='ml-auto'
    />
  );
}
