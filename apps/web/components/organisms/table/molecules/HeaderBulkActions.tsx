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

export interface BulkAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
}

export interface HeaderBulkActionsProps {
  /** Number of selected items */
  selectedCount: number;
  /** Bulk actions shown in dropdown when items selected */
  bulkActions: BulkAction[];
  /** Callback to clear selection */
  onClearSelection?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Inline header bulk actions shown when items are selected.
 *
 * Only renders when selectedCount > 0. Shows "X selected", Actions dropdown,
 * and clear button. Designed to be placed in the first data column header.
 *
 * @example
 * <th>
 *   <div className="flex items-center gap-2">
 *     {selectedIds.size === 0 && <span>Release</span>}
 *     <HeaderBulkActions
 *       selectedCount={selectedIds.size}
 *       bulkActions={bulkActions}
 *       onClearSelection={clearSelection}
 *     />
 *   </div>
 * </th>
 */
export function HeaderBulkActions({
  selectedCount,
  bulkActions,
  onClearSelection,
  className,
}: HeaderBulkActionsProps) {
  // Only render when items are selected
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 h-7', className)}>
      <span className='text-xs font-medium text-secondary-token tabular-nums whitespace-nowrap'>
        {selectedCount} selected
      </span>
      {bulkActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary' size='sm' className='h-7 normal-case'>
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            {bulkActions.map(action => (
              <DropdownMenuItem
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  'flex items-center gap-2',
                  action.variant === 'destructive' &&
                    'text-destructive focus:text-destructive'
                )}
              >
                {action.icon && <span className='h-4 w-4'>{action.icon}</span>}
                <span>{action.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onClearSelection && (
        <Button
          variant='ghost'
          size='sm'
          onClick={onClearSelection}
          className='h-7 w-7 p-0'
          aria-label='Clear selection'
        >
          <X className='h-3.5 w-3.5' />
        </Button>
      )}
    </div>
  );
}
