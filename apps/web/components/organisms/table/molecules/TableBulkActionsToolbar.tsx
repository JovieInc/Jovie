'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TableCountBadge } from '../atoms/TableCountBadge';
import { PAGE_TOOLBAR_ACTION_BUTTON_CLASS } from './PageToolbar';

export interface BulkAction {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant?: 'default' | 'destructive';
}

export interface TableBulkActionsToolbarProps {
  readonly selectedCount: number;
  readonly onClearSelection: () => void;
  readonly actions: BulkAction[];
  readonly className?: string;
}

const TABLE_BULK_ACTIONS_TOOLBAR_CLASS =
  'absolute inset-x-0 top-0 z-10 flex h-11 min-h-[44px] min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-3.5 py-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const TABLE_BULK_ACTIONS_MENU_BUTTON_CLASS = cn(
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  'min-w-[88px] justify-center text-secondary-token'
);

export function TableBulkActionsToolbar({
  selectedCount,
  onClearSelection,
  actions,
  className,
}: TableBulkActionsToolbarProps) {
  const hasSelection = selectedCount > 0;

  if (!hasSelection) {
    return (
      <div
        aria-hidden='true'
        data-state='hidden'
        className={cn(
          TABLE_BULK_ACTIONS_TOOLBAR_CLASS,
          'pointer-events-none opacity-0',
          className
        )}
      >
        <span className='h-7 w-px' />
      </div>
    );
  }

  return (
    <div
      aria-hidden='false'
      data-state='visible'
      className={cn(TABLE_BULK_ACTIONS_TOOLBAR_CLASS, 'opacity-100', className)}
    >
      {/* Selected count - totalCount is unused since this toolbar only renders when selectedCount > 0 */}
      <TableCountBadge
        selectedCount={selectedCount}
        totalCount={0}
        variant='text'
      />

      {/* Actions dropdown */}
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              className={TABLE_BULK_ACTIONS_MENU_BUTTON_CLASS}
            >
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            {actions.map(action => (
              <DropdownMenuItem
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className={
                  action.variant === 'destructive'
                    ? 'text-destructive focus:text-destructive'
                    : undefined
                }
              >
                {action.icon && (
                  <span className='flex h-3.5 w-3.5 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5'>
                    {action.icon}
                  </span>
                )}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Clear selection */}
      <Button
        variant='ghost'
        size='sm'
        onClick={onClearSelection}
        className={cn(PAGE_TOOLBAR_ACTION_BUTTON_CLASS, 'ml-auto')}
      >
        <X className='h-3.5 w-3.5' />
        Clear
      </Button>
    </div>
  );
}
