'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from '@jovie/ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BulkAction {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant?: 'default' | 'destructive';
}

export interface HeaderBulkActionsProps {
  /** Number of selected items */
  readonly selectedCount: number;
  /** Bulk actions shown in dropdown when items selected */
  readonly bulkActions: BulkAction[];
  /** Callback to clear selection */
  readonly onClearSelection?: () => void;
  /** Additional CSS classes */
  readonly className?: string;
}

/**
 * Inline header bulk actions shown when items are selected.
 *
 * Only renders when selectedCount > 0. Shows "X selected", Actions dropdown,
 * and clear button. Designed to be placed in the first data column header.
 * Labeled Actions stays on Button `sm` (28px). Icon-only dismiss uses
 * IconButton `sm` so geometry, focus, and the 44px hit target stay shared.
 *
 * @example
 * <th className='whitespace-nowrap'>
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
    <div className={cn('flex h-7 items-center gap-2', className)}>
      <span className='whitespace-nowrap text-2xs font-caption tabular-nums text-secondary-token'>
        {selectedCount} selected
      </span>
      {bulkActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary' size='sm'>
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            {bulkActions.map(action => (
              <DropdownMenuItem
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                variant={action.variant}
              >
                {action.icon}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onClearSelection ? (
        <IconButton
          variant='secondary'
          size='sm'
          onClick={onClearSelection}
          ariaLabel='Clear Selection'
        >
          <X aria-hidden='true' />
        </IconButton>
      ) : null}
    </div>
  );
}
