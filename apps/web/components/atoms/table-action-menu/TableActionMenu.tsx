'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import {
  geistTableMenuContentClass,
  geistTableMenuDestructiveItemClass,
  geistTableMenuItemClass,
  geistTableMenuSeparatorClass,
} from '@/lib/ui/geist-table-menu';
import { cn } from '@/lib/utils';

import type { TableActionMenuProps } from './types';
import { isSeparatorItem } from './utils';

export function TableActionMenu({
  items,
  trigger = 'button',
  triggerIcon: TriggerIcon = MoreHorizontal,
  align = 'end',
  open,
  onOpenChange,
  children,
}: TableActionMenuProps) {
  // Render menu items
  const renderMenuItems = (isContextMenu: boolean): React.ReactNode => {
    return items.map((item, index) => {
      // Render separator
      if (isSeparatorItem(item.id)) {
        return (
          <div
            key={`separator-${index}`}
            className={geistTableMenuSeparatorClass}
          />
        );
      }

      const Icon = item.icon;
      const MenuItemComponent = isContextMenu
        ? ContextMenuItem
        : DropdownMenuItem;

      return (
        <MenuItemComponent
          key={item.id}
          onClick={e => {
            e.stopPropagation();
            item.onClick();
          }}
          disabled={item.disabled}
          className={cn(
            geistTableMenuItemClass,
            item.variant === 'destructive' && geistTableMenuDestructiveItemClass
          )}
        >
          {Icon && <Icon className='h-3.5 w-3.5' />}
          <span className='flex-1'>{item.label}</span>
          {item.subText && (
            <span className='text-[11px] text-tertiary-token'>
              {item.subText}
            </span>
          )}
        </MenuItemComponent>
      );
    });
  };

  // Context menu trigger (right-click)
  if (trigger === 'context' && children) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className={geistTableMenuContentClass}>
          {renderMenuItems(true)}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // Custom trigger (passed as children)
  if (trigger === 'custom' && children) {
    return (
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className={geistTableMenuContentClass}
        >
          {renderMenuItems(false)}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Default button trigger
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className='inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          aria-label='More actions'
          onClick={e => e.stopPropagation()}
        >
          <TriggerIcon className='h-4 w-4' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={geistTableMenuContentClass}>
        {renderMenuItems(false)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
