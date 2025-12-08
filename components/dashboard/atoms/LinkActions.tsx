'use client';

import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface LinkActionsProps {
  /** Callback when visibility is toggled */
  onToggle: () => void;
  /** Callback when link is removed */
  onRemove: () => void;
  /** Callback when edit is clicked */
  onEdit?: () => void;
  /** Whether the link is currently visible */
  isVisible: boolean;
  /** Whether to show the drag handle (default: true) */
  showDragHandle?: boolean;
  /** Pointer down handler for drag handle */
  onDragHandlePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * LinkActions - Atomic component for link visibility toggle, remove, and drag actions.
 * Uses design system tokens for consistent theming.
 */
export const LinkActions = memo(function LinkActions({
  onToggle,
  onRemove,
  onEdit,
  isVisible,
  showDragHandle = true,
  onDragHandlePointerDown,
  className,
}: LinkActionsProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {onEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size='icon'
              variant='ghost'
              className='h-7 w-7 text-tertiary-token hover:text-secondary-token opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
              onClick={onEdit}
              aria-label='Edit link'
            >
              <Icon name='Pencil' className='h-3.5 w-3.5' />
            </Button>
          </TooltipTrigger>
          <TooltipContent side='top'>Edit link</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            className='h-7 w-7 text-tertiary-token hover:text-secondary-token opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
            onClick={onToggle}
            aria-label={isVisible ? 'Hide link' : 'Show link'}
            aria-pressed={isVisible}
          >
            {isVisible ? (
              <Icon name='Eye' className='h-3.5 w-3.5' />
            ) : (
              <Icon name='EyeOff' className='h-3.5 w-3.5' />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>
          {isVisible ? 'Hide link' : 'Show link'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            className='h-7 w-7 text-tertiary-token hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
            onClick={onRemove}
            aria-label='Remove link'
          >
            <Icon name='Trash2' className='h-3.5 w-3.5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top'>Remove link</TooltipContent>
      </Tooltip>

      {showDragHandle && (
        <button
          type='button'
          className='h-7 w-5 flex items-center justify-center text-tertiary-token/40 hover:text-tertiary-token/70 transition-colors cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
          onPointerDown={onDragHandlePointerDown}
          aria-label='Drag to reorder'
          aria-roledescription='sortable'
        >
          <Icon name='GripVertical' className='h-4 w-4' />
        </button>
      )}
    </div>
  );
});

LinkActions.displayName = 'LinkActions';
