'use client';

// @coverage-via apps/web/tests/unit/DrawerHeaderActions.test.tsx

import { type CommonDropdownItem, IconButton } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import { MoreVertical, X } from 'lucide-react';
import Link from 'next/link';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  appendCloseActionMenuItem,
  commonDropdownItemsToTableActionMenuItems,
} from '@/components/molecules/drawer/menu-items';
import { cn } from '@/lib/utils';

/**
 * @deprecated Restyles IconButton (shadcn/no-restyle). Drawer header actions
 * use the canonical `ghost` / `sm` IconButton; kept only for
 * DrawerCardActionBar until it migrates.
 */
export const DRAWER_HEADER_ICON_BUTTON_CLASSNAME =
  'h-7 w-7 rounded-full border border-transparent bg-transparent shadow-none hover:bg-surface-1 focus-visible:outline-none focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-1';

export interface DrawerHeaderAction {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Icon to show when isActive is true (e.g., Check icon after copy) */
  readonly activeIcon?: LucideIcon;
  /** When true, shows activeIcon instead of icon */
  readonly isActive?: boolean;
  readonly onClick?: () => void;
  readonly asChild?: boolean;
  readonly href?: string;
  readonly disabled?: boolean;
}

export interface DrawerHeaderActionsProps {
  readonly primaryActions: DrawerHeaderAction[]; // Max 2, shown inline
  readonly overflowActions?: DrawerHeaderAction[]; // Rest in ellipsis menu
  readonly menuItems?: readonly CommonDropdownItem[]; // Shared menu items, usually from contextMenuItems
  readonly onClose?: () => void;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly searchMode?: 'root' | 'recursive';
}

/**
 * Drawer header actions component
 * Shows top 2 priority actions inline, collapses rest into ellipsis menu
 */
export function DrawerHeaderActions({
  primaryActions,
  overflowActions = [],
  menuItems,
  onClose,
  searchable = false,
  searchPlaceholder,
  searchMode = 'root',
}: DrawerHeaderActionsProps) {
  // Ensure max 2 primary actions
  const displayActions = primaryActions.slice(0, 2);

  // Convert overflow actions to menu items with defensive filtering
  const baseMenuItems: TableActionMenuItem[] = overflowActions
    .filter(action => action?.id && action?.label)
    .map(action => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      disabled: action.disabled,
      onClick:
        action.onClick ||
        (action.href
          ? () => globalThis.open(action.href, '_blank', 'noopener,noreferrer')
          : () => {}),
    }));

  const resolvedBaseMenuItems: TableActionMenuItem[] =
    menuItems && menuItems.length > 0
      ? commonDropdownItemsToTableActionMenuItems(menuItems)
      : baseMenuItems;
  const resolvedMenuItems = appendCloseActionMenuItem(
    resolvedBaseMenuItems,
    onClose
  );

  return (
    <div className='flex items-center gap-0.5'>
      {/* Primary actions - always visible. Canonical ghost/sm IconButton:
          28px, transparent at rest, surface on hover, shared focus ring. */}
      {displayActions.map(action => {
        const Icon =
          action.isActive && action.activeIcon
            ? action.activeIcon
            : action.icon;

        if (action.href) {
          return (
            <IconButton
              key={action.id}
              asChild
              variant='ghost'
              size='sm'
              ariaLabel={action.label}
            >
              <Link href={action.href}>
                <Icon aria-hidden='true' />
              </Link>
            </IconButton>
          );
        }

        const DefaultIcon = action.icon;
        const ActiveIcon = action.activeIcon;

        return (
          <IconButton
            key={action.id}
            variant='ghost'
            size='sm'
            disabled={action.disabled}
            onClick={action.onClick}
            ariaLabel={action.label}
            data-active={action.isActive ? 'true' : undefined}
          >
            <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
              <DefaultIcon
                className={cn(
                  'absolute h-3.5 w-3.5 transition-opacity duration-subtle',
                  action.isActive ? 'opacity-0' : 'opacity-100'
                )}
                aria-hidden='true'
              />
              {ActiveIcon && (
                <ActiveIcon
                  className={cn(
                    'absolute h-3.5 w-3.5 transition-opacity duration-subtle',
                    action.isActive ? 'opacity-100' : 'opacity-0'
                  )}
                  aria-hidden='true'
                />
              )}
            </span>
          </IconButton>
        );
      })}

      {/* Overflow menu - only shown if there are overflow actions */}
      {resolvedMenuItems.length > 0 && (
        <TableActionMenu
          items={resolvedMenuItems}
          trigger='custom'
          align='end'
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          searchMode={searchMode}
        >
          <IconButton variant='ghost' size='sm' ariaLabel='More actions'>
            <MoreVertical aria-hidden='true' />
          </IconButton>
        </TableActionMenu>
      )}

      {/* Below lg every drawer is a full-screen sheet with nothing outside it
          to tap, so a closable drawer shows a visible Close (desktop keeps
          Esc and the menu item). */}
      {onClose ? (
        <IconButton
          variant='ghost'
          size='sm'
          onClick={onClose}
          ariaLabel='Close'
          className='lg:hidden'
          data-testid='drawer-header-close'
        >
          <X aria-hidden='true' />
        </IconButton>
      ) : null}
    </div>
  );
}
