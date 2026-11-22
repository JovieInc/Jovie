'use client';

import {
  ACTION_OVERFLOW_MAX_PRIMARY,
  IconButton,
  partitionRankedActions,
  type RankableAction,
} from '@jovie/ui';
import { type LucideIcon, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import { cn } from '@/lib/utils';

export type TableRowActionBarVisibility = 'always' | 'hover';

export interface TableRowActionBarAction extends RankableAction {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick?: () => void;
  readonly href?: string;
  readonly disabled?: boolean;
  readonly variant?: 'default' | 'destructive';
  readonly activeIcon?: LucideIcon;
  readonly isActive?: boolean;
  readonly subText?: string;
}

export interface TableRowActionBarProps {
  readonly actions: readonly TableRowActionBarAction[];
  /** Cap for the inline primary strip. Defaults to shared `ACTION_OVERFLOW_MAX_PRIMARY`. */
  readonly maxPrimary?: number;
  readonly align?: 'start' | 'center' | 'end';
  readonly overflowAriaLabel?: string;
  /**
   * `hover` uses IconButton `fade="parent"` — the row must expose a `group`
   * ancestor (UnifiedTable rows already do).
   */
  readonly visibility?: TableRowActionBarVisibility;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly searchMode?: 'root' | 'recursive';
}

export interface TableRowOverflowTriggerProps
  extends Omit<
    ComponentPropsWithoutRef<typeof IconButton>,
    'variant' | 'size' | 'fade' | 'ariaLabel' | 'children'
  > {
  readonly visibility?: TableRowActionBarVisibility;
  readonly ariaLabel?: string;
}

/**
 * Shared table-row ⋯ trigger. Prefer this (or `TableRowActionBar`) over
 * one-off MoreHorizontal icon-button chrome on entity tables.
 *
 * Forwards unknown props/ref so Radix `asChild` Trigger composition
 * (aria-haspopup, open-state, composed onClick) reaches the IconButton.
 */
export const TableRowOverflowTrigger = forwardRef<
  HTMLButtonElement,
  TableRowOverflowTriggerProps
>(function TableRowOverflowTrigger(
  {
    visibility = 'always',
    ariaLabel = 'More actions',
    disabled = false,
    onClick,
    onPointerDown,
    onKeyDown,
    ...rest
  },
  ref
) {
  return (
    <IconButton
      ref={ref}
      type='button'
      variant='ghost'
      size='sm'
      fade={visibility === 'hover' ? 'parent' : undefined}
      ariaLabel={ariaLabel}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onPointerDown={event => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      onKeyDown={event => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
      {...rest}
    >
      <MoreHorizontal className='h-3.5 w-3.5' aria-hidden='true' />
    </IconButton>
  );
});

/**
 * Canonical table-row action strip: ranked primary IconButtons + one overflow
 * `TableActionMenu`. Uses `@jovie/ui` `partitionRankedActions` so drawer headers
 * and table rows share the same capacity and ranking rules (Drift DRI-22).
 */
export function TableRowActionBar({
  actions,
  maxPrimary = ACTION_OVERFLOW_MAX_PRIMARY,
  align = 'end',
  overflowAriaLabel = 'More actions',
  visibility = 'always',
  open,
  onOpenChange,
  className,
  searchable = false,
  searchPlaceholder,
  searchMode = 'root',
}: TableRowActionBarProps) {
  const ranked = actions.map(action =>
    action.variant === 'destructive' && action.destructive === undefined
      ? { ...action, destructive: true }
      : action
  );
  const { primary, overflow } = partitionRankedActions(ranked, { maxPrimary });
  const menuItems = toMenuItems(overflow);

  return (
    <div
      role='toolbar'
      className={cn('flex items-center justify-end gap-0.5', className)}
    >
      {primary.map(action => {
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
              disabled={action.disabled}
            >
              <Link
                href={action.href}
                onClick={event => event.stopPropagation()}
                onKeyDown={event => event.stopPropagation()}
              >
                <Icon aria-hidden='true' className='h-3.5 w-3.5' />
              </Link>
            </IconButton>
          );
        }

        return (
          <IconButton
            key={action.id}
            variant='ghost'
            size='sm'
            ariaLabel={action.label}
            disabled={action.disabled}
            onClick={event => {
              event.stopPropagation();
              action.onClick?.();
            }}
            onKeyDown={event => event.stopPropagation()}
            data-active={action.isActive ? 'true' : undefined}
          >
            <Icon aria-hidden='true' className='h-3.5 w-3.5' />
          </IconButton>
        );
      })}

      {menuItems.length > 0 ? (
        <TableActionMenu
          items={menuItems}
          trigger='custom'
          align={align}
          open={open}
          onOpenChange={onOpenChange}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          searchMode={searchMode}
        >
          <TableRowOverflowTrigger
            visibility={visibility}
            ariaLabel={overflowAriaLabel}
          />
        </TableActionMenu>
      ) : null}
    </div>
  );
}

function toMenuItems(
  actions: readonly TableRowActionBarAction[]
): TableActionMenuItem[] {
  return actions.map(action => ({
    id: action.id,
    label: action.label,
    icon: action.icon,
    onClick: action.onClick,
    disabled: action.disabled,
    variant: action.variant ?? (action.destructive ? 'destructive' : 'default'),
    subText: action.subText,
  }));
}
