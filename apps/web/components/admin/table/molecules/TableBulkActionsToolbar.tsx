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

export interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface TableBulkActionsToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
  className?: string;
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
      {/* Selected count */}
      <span className='text-sm font-medium text-primary-token'>
        {selectedCount} selected
      </span>

      {/* Actions dropdown */}
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='secondary' size='sm'>
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            {actions.map((action, index) => (
              <DropdownMenuItem
                key={index}
                onClick={action.onClick}
                className='flex items-center gap-2'
              >
                {action.icon && <span className='h-4 w-4'>{action.icon}</span>}
                <span>{action.label}</span>
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
        className='ml-auto flex items-center gap-1.5'
      >
        <X className='h-4 w-4' />
        Clear
      </Button>
    </div>
  );
}
