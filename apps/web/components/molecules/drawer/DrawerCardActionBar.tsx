'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Button } from '@jovie/ui';
import { MoreHorizontal, MoreVertical, X } from 'lucide-react';
import Link from 'next/link';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  appendCloseActionMenuItem,
  commonDropdownItemsToTableActionMenuItems,
} from '@/components/molecules/drawer/menu-items';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DRAWER_HEADER_ICON_BUTTON_CLASSNAME } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { cn } from '@/lib/utils';

export interface DrawerCardActionBarProps {
  readonly primaryActions: readonly DrawerHeaderAction[];
  readonly overflowActions?: readonly DrawerHeaderAction[];
  readonly menuItems?: readonly CommonDropdownItem[];
  readonly className?: string;
  readonly onClose?: () => void;
  readonly overflowTriggerPlacement?: 'inline' | 'card-top-right';
  readonly overflowTriggerIcon?: 'horizontal' | 'vertical';
}

export const DRAWER_CARD_ACTION_BUTTON_CLASSNAME = cn(
  'inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-subtle bg-surface-1 px-2.5 text-[11.5px] font-caption text-secondary-token transition-[background-color,border-color,color] duration-150 hover:border-default hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:border-focus focus-visible:bg-surface-0 focus-visible:ring-2 focus-visible:ring-focus/16 active:border-default active:bg-surface-1 [&_svg]:h-3.5 [&_svg]:w-3.5'
);

function toMenuItems(
  actions: readonly DrawerHeaderAction[]
): TableActionMenuItem[] {
  return actions
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
}

export function DrawerCardActionBar({
  primaryActions,
  overflowActions = [],
  menuItems,
  className,
  onClose,
  overflowTriggerPlacement = 'inline',
  overflowTriggerIcon,
}: DrawerCardActionBarProps) {
  const displayActions = primaryActions.slice(0, 3);
  const baseMenuItems = toMenuItems(overflowActions);
  const resolvedBaseMenuItems =
    menuItems && menuItems.length > 0
      ? commonDropdownItemsToTableActionMenuItems(menuItems)
      : baseMenuItems;
  const hasFloatingCloseButton =
    overflowTriggerPlacement === 'card-top-right' && Boolean(onClose);
  const resolvedMenuItems = hasFloatingCloseButton
    ? resolvedBaseMenuItems
    : appendCloseActionMenuItem(resolvedBaseMenuItems, onClose);
  const resolvedTriggerIcon =
    overflowTriggerIcon ??
    (overflowTriggerPlacement === 'card-top-right' ? 'vertical' : 'horizontal');
  const TriggerIcon =
    resolvedTriggerIcon === 'vertical' ? MoreVertical : MoreHorizontal;

  if (
    displayActions.length === 0 &&
    resolvedMenuItems.length === 0 &&
    !hasFloatingCloseButton
  ) {
    return null;
  }

  const overflowTrigger =
    resolvedMenuItems.length > 0 ? (
      <TableActionMenu items={resolvedMenuItems} trigger='custom' align='end'>
        <AppIconButton
          ariaLabel='More actions'
          className={cn(
            DRAWER_HEADER_ICON_BUTTON_CLASSNAME,
            'text-tertiary-token'
          )}
          data-testid='drawer-card-overflow-trigger'
        >
          <TriggerIcon className='h-3.5 w-3.5' aria-hidden='true' />
        </AppIconButton>
      </TableActionMenu>
    ) : null;

  const floatingCloseButton =
    hasFloatingCloseButton && onClose ? (
      <AppIconButton
        ariaLabel='Close'
        className={cn(
          DRAWER_HEADER_ICON_BUTTON_CLASSNAME,
          'text-tertiary-token'
        )}
        data-testid='drawer-card-close-trigger'
        onClick={onClose}
      >
        <X className='h-3.5 w-3.5' aria-hidden='true' />
      </AppIconButton>
    ) : null;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden border-t border-subtle px-2.5 py-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        overflowTriggerPlacement === 'card-top-right' &&
          (overflowTrigger ? 'pr-[4.75rem]' : 'pr-11'),
        className
      )}
      data-testid='drawer-card-action-bar'
      data-overflow-placement={overflowTriggerPlacement}
    >
      {overflowTriggerPlacement === 'card-top-right' && overflowTrigger ? (
        <div className='absolute right-3 top-3 z-10 flex items-center gap-1'>
          {overflowTrigger}
          {floatingCloseButton}
        </div>
      ) : null}
      {overflowTriggerPlacement === 'card-top-right' &&
      !overflowTrigger &&
      floatingCloseButton ? (
        <div className='absolute right-3 top-3 z-10'>{floatingCloseButton}</div>
      ) : null}
      {displayActions.map(action => {
        const Icon =
          action.isActive && action.activeIcon
            ? action.activeIcon
            : action.icon;

        if (action.href) {
          return (
            <Button
              key={action.id}
              type='button'
              variant='ghost'
              size='sm'
              asChild
              className={DRAWER_CARD_ACTION_BUTTON_CLASSNAME}
            >
              <Link href={action.href}>
                <Icon className='h-3.5 w-3.5' aria-hidden='true' />
                <span>{action.label}</span>
              </Link>
            </Button>
          );
        }

        return (
          <Button
            key={action.id}
            type='button'
            variant='ghost'
            size='sm'
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              DRAWER_CARD_ACTION_BUTTON_CLASSNAME,
              action.isActive
                ? 'text-primary-token'
                : 'text-secondary-token hover:text-primary-token'
            )}
          >
            <Icon className='h-3.5 w-3.5' aria-hidden='true' />
            <span>{action.label}</span>
          </Button>
        );
      })}

      {overflowTriggerPlacement === 'inline' && overflowTrigger ? (
        <div className='ml-auto'>{overflowTrigger}</div>
      ) : null}
    </div>
  );
}
