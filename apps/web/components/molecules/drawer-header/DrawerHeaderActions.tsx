'use client';

import { Button } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import { MoreVertical } from 'lucide-react';
import Link from 'next/link';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';

export interface DrawerHeaderAction {
  id: string;
  label: string;
  icon: LucideIcon;
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
        const Icon = action.icon;

        if (action.href) {
          return (
            <Button
              key={action.id}
              size='icon'
              variant='ghost'
              asChild
              className='p-1.5'
              aria-label={action.label}
            >
              <Link href={action.href}>
                <Icon className='h-4 w-4' />
              </Link>
            </Button>
          );
        }

        return (
          <Button
            key={action.id}
            size='icon'
            variant='ghost'
            onClick={action.onClick}
            className='p-1.5'
            aria-label={action.label}
          >
            <Icon className='h-4 w-4' />
          </Button>
        );
      })}

      {/* Overflow menu - only shown if there are overflow actions */}
      {menuItems.length > 0 && (
        <TableActionMenu items={menuItems} trigger='custom' align='end'>
          <Button
            size='icon'
            variant='ghost'
            className='p-1.5'
            aria-label='More actions'
          >
            <MoreVertical className='h-4 w-4' />
          </Button>
        </TableActionMenu>
      )}
    </div>
  );
}
