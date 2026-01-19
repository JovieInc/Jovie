'use client';

import { Button } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import { MoreVertical } from 'lucide-react';
import Link from 'next/link';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import { cn } from '@/lib/utils';

export interface DrawerHeaderAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Icon to show when isActive is true (e.g., Check icon after copy) */
  activeIcon?: LucideIcon;
  /** When true, shows activeIcon instead of icon */
  isActive?: boolean;
  onClick?: () => void;
  asChild?: boolean;
  href?: string;
}

export interface DrawerHeaderActionsProps {
  primaryActions: DrawerHeaderAction[]; // Max 2, shown inline
  overflowActions?: DrawerHeaderAction[]; // Rest in ellipsis menu
}

/**
 * Drawer header actions component
 * Shows top 2 priority actions inline, collapses rest into ellipsis menu
 */
export function DrawerHeaderActions({
  primaryActions,
  overflowActions = [],
}: DrawerHeaderActionsProps) {
  // Ensure max 2 primary actions
  const displayActions = primaryActions.slice(0, 2);

  // Convert overflow actions to menu items
  const menuItems: TableActionMenuItem[] = overflowActions.map(action => ({
    id: action.id,
    label: action.label,
    icon: action.icon,
    onClick: action.onClick || (() => {}),
  }));

  return (
    <div className='flex items-center gap-1'>
      {/* Primary actions - always visible */}
      {displayActions.map(action => {
        const Icon =
          action.isActive && action.activeIcon
            ? action.activeIcon
            : action.icon;

        if (action.href) {
          return (
            <Button
              key={action.id}
              size='icon'
              variant='ghost'
              asChild
              className='h-8 w-8 rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
              aria-label={action.label}
            >
              <Link href={action.href}>
                <Icon className='h-3.5 w-3.5' />
              </Link>
            </Button>
          );
        }

        const DefaultIcon = action.icon;
        const ActiveIcon = action.activeIcon;

        return (
          <Button
            key={action.id}
            size='icon'
            variant='ghost'
            onClick={action.onClick}
            className={cn(
              'h-8 w-8 rounded-md transition-colors hover:bg-surface-2',
              action.isActive
                ? 'text-green-600 hover:text-green-600 dark:text-green-400 dark:hover:text-green-400'
                : 'text-tertiary-token hover:text-primary-token'
            )}
            aria-label={action.label}
          >
            <span className='relative flex h-3.5 w-3.5 items-center justify-center'>
              <DefaultIcon
                className={cn(
                  'absolute h-3.5 w-3.5 transition-all duration-150',
                  action.isActive
                    ? 'scale-50 opacity-0'
                    : 'scale-100 opacity-100'
                )}
              />
              {ActiveIcon && (
                <ActiveIcon
                  className={cn(
                    'absolute h-3.5 w-3.5 transition-all duration-150',
                    action.isActive
                      ? 'scale-100 opacity-100'
                      : 'scale-50 opacity-0'
                  )}
                />
              )}
            </span>
          </Button>
        );
      })}

      {/* Overflow menu - only shown if there are overflow actions */}
      {menuItems.length > 0 && (
        <TableActionMenu items={menuItems} trigger='custom' align='end'>
          <Button
            size='icon'
            variant='ghost'
            className='h-8 w-8 rounded-md text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
            aria-label='More actions'
          >
            <MoreVertical className='h-3.5 w-3.5' />
          </Button>
        </TableActionMenu>
      )}
    </div>
  );
}
