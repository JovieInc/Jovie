'use client';

import type { LucideIcon } from 'lucide-react';
import { MoreVertical, X } from 'lucide-react';
import Link from 'next/link';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import { cn } from '@/lib/utils';

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
}

export interface DrawerHeaderActionsProps {
  readonly primaryActions: DrawerHeaderAction[]; // Max 2, shown inline
  readonly overflowActions?: DrawerHeaderAction[]; // Rest in ellipsis menu
  readonly onClose?: () => void;
}

/**
 * Drawer header actions component
 * Shows top 2 priority actions inline, collapses rest into ellipsis menu
 */
export function DrawerHeaderActions({
  primaryActions,
  overflowActions = [],
  onClose,
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
      onClick:
        action.onClick ||
        (action.href
          ? () => globalThis.open(action.href, '_blank', 'noopener,noreferrer')
          : () => {}),
    }));

  const menuItems: TableActionMenuItem[] = onClose
    ? [
        ...baseMenuItems,
        ...(baseMenuItems.length > 0 ? [{ id: 'separator', label: '' }] : []),
        {
          id: 'close-drawer',
          label: 'Close',
          icon: X,
          onClick: onClose,
        },
      ]
    : baseMenuItems;

  return (
    <div className='flex items-center gap-px'>
      {/* Primary actions - always visible */}
      {displayActions.map(action => {
        const Icon =
          action.isActive && action.activeIcon
            ? action.activeIcon
            : action.icon;

        if (action.href) {
          return (
            <AppIconButton
              key={action.id}
              asChild
              className='border-transparent bg-transparent text-(--linear-text-tertiary) hover:bg-white/[0.04]'
              aria-label={action.label}
            >
              <Link href={action.href}>
                <Icon className='h-3.5 w-3.5' />
              </Link>
            </AppIconButton>
          );
        }

        const DefaultIcon = action.icon;
        const ActiveIcon = action.activeIcon;

        return (
          <AppIconButton
            key={action.id}
            onClick={action.onClick}
            className={cn(
              'border-transparent bg-transparent hover:bg-white/[0.04]',
              action.isActive
                ? 'text-success hover:text-success'
                : 'text-(--linear-text-tertiary) hover:text-(--linear-text-primary)'
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
          </AppIconButton>
        );
      })}

      {/* Overflow menu - only shown if there are overflow actions */}
      {menuItems.length > 0 && (
        <TableActionMenu items={menuItems} trigger='custom' align='end'>
          <AppIconButton
            className='border-transparent bg-transparent text-(--linear-text-tertiary) hover:bg-white/[0.04]'
            aria-label='More actions'
          >
            <MoreVertical className='h-3.5 w-3.5' />
          </AppIconButton>
        </TableActionMenu>
      )}
    </div>
  );
}
