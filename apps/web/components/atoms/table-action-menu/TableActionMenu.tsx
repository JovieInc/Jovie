'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { CommonDropdown } from '@jovie/ui';
import { MoreVertical } from 'lucide-react';

import type { TableActionMenuProps } from './types';
import { isSeparatorItem } from './utils';

// Geist-style overrides for table menus (smaller, more compact)
const GEIST_CONTENT_CLASS =
  'min-w-[10.5rem] rounded-lg p-0.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.55)]';

const GEIST_ITEM_CLASS =
  'rounded-md px-2 py-1 text-[12.5px] font-medium leading-[16px] [&_svg]:text-tertiary-token hover:[&_svg]:text-secondary-token data-[highlighted]:[&_svg]:text-secondary-token focus-visible:[&_svg]:text-secondary-token';

/**
 * TableActionMenu - Wrapper around CommonDropdown with Geist table styling
 *
 * Provides a compact, table-optimized dropdown menu for row actions.
 * Uses CommonDropdown internally with Geist-specific styling overrides.
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
        className: '-mx-0.5 my-1', // Geist separator spacing
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
      className: GEIST_ITEM_CLASS,
    };
  });

  // Context menu variant
  if (trigger === 'context' && children) {
    return (
      <CommonDropdown
        variant='context'
        items={dropdownItems}
        contentClassName={GEIST_CONTENT_CLASS}
      >
        {children}
      </CommonDropdown>
    );
  }

  // Custom trigger variant
  if (trigger === 'custom' && children) {
    return (
      <CommonDropdown
        variant='dropdown'
        items={dropdownItems}
        trigger={children}
        align={align}
        open={open}
        onOpenChange={onOpenChange}
        contentClassName={GEIST_CONTENT_CLASS}
      />
    );
  }

  // Default button trigger
  return (
    <CommonDropdown
      variant='dropdown'
      items={dropdownItems}
      triggerIcon={TriggerIcon}
      align={align}
      open={open}
      onOpenChange={onOpenChange}
      contentClassName={GEIST_CONTENT_CLASS}
      triggerClassName='ml-auto'
    />
  );
}
