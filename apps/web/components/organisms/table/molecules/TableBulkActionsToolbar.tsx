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

export interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

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
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 bg-surface-1 border-b border-subtle',
        className
      )}
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
            <Button variant='secondary' size='sm'>
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            {actions.map(action => (
              <DropdownMenuItem key={action.label} onClick={action.onClick}>
                {action.icon && (
                  <span className='h-4 w-4 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4'>
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
        className='ml-auto'
      >
        <X className='h-4 w-4 mr-1' />
        Clear
      </Button>
    </div>
  );
}
