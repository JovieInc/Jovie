'use client';

import React, { memo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { cn } from '@/lib/utils';

export interface LinkActionsProps {
  onToggle: () => void;
  onRemove: () => void;
  onEdit?: () => void;
  isVisible: boolean;
  showDragHandle?: boolean;
  onDragHandlePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  showDragHandle = false,
  onDragHandlePointerDown,
  className,
  isOpen,
  onOpenChange,
}: LinkActionsProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const open = isOpen ?? openInternal;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setOpenInternal(next);
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {showDragHandle ? (
        <button
          type='button'
          onPointerDown={onDragHandlePointerDown}
          className='opacity-0 group-hover:opacity-70 group-focus-within:opacity-100 transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-100 active:scale-[0.97]'
          aria-label='Drag to reorder'
        >
          <span className='inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface-2/80 text-secondary-token ring-1 ring-subtle shadow-sm'>
            <Icon name='GripVertical' className='h-3.5 w-3.5' />
          </span>
        </button>
      ) : null}

      <div className='relative'>
        <button
          type='button'
          aria-label='Link actions'
          onClick={() => setOpen(!open)}
          className='inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface-2/70 text-secondary-token ring-1 ring-subtle transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-primary-token hover:bg-surface-2 active:scale-[0.97]'
        >
          <Icon name='MoreVertical' className='h-4 w-4' />
        </button>
        <div className='sr-only'>Actions: edit, hide/show, delete</div>

        {open ? (
          <div className='absolute right-0 top-9 z-10 min-w-[140px] rounded-lg border border-subtle bg-surface-1 p-1 text-sm shadow-lg'>
            {onEdit ? (
              <button
                type='button'
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97]'
              >
                <Icon name='Pencil' className='h-4 w-4' />
                Edit
              </button>
            ) : null}
            <button
              type='button'
              onClick={() => {
                setOpen(false);
                onToggle();
              }}
              className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97]'
            >
              <Icon name={isVisible ? 'Eye' : 'EyeOff'} className='h-4 w-4' />
              {isVisible ? 'Hide' : 'Show'}
            </button>
            <button
              type='button'
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-destructive hover:text-destructive/80 hover:bg-surface-2 transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97]'
            >
              <Icon name='Trash' className='h-4 w-4' />
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});

LinkActions.displayName = 'LinkActions';
