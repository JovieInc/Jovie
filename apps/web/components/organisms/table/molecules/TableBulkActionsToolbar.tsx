'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableCountBadge } from '../atoms/TableCountBadge';
import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  TABLE_TOOLBAR_MENU_BUTTON_CLASS,
  TABLE_TOOLBAR_OVERLAY_CLASS,
  type TableToolbarBulkAction,
} from './PageToolbar';

export type BulkAction = TableToolbarBulkAction;

export interface TableBulkActionsToolbarProps {
  readonly selectedCount: number;
  readonly onClearSelection: () => void;
  readonly actions: BulkAction[];
  readonly className?: string;
}

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
          TABLE_TOOLBAR_OVERLAY_CLASS,
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
      className={cn(TABLE_TOOLBAR_OVERLAY_CLASS, 'opacity-100', className)}
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
              className={TABLE_TOOLBAR_MENU_BUTTON_CLASS}
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
