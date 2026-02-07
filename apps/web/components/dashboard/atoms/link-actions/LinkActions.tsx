'use client';

import { memo, useCallback, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { cn } from '@/lib/utils';
import type { LinkActionsProps } from './types';
import { useLinkActionsMenu } from './useLinkActionsMenu';

/** Get icon name for menu item */
function getMenuItemIcon(
  itemId: string,
  isVisible: boolean
): 'Pencil' | 'Eye' | 'EyeOff' | 'Trash' {
  if (itemId === 'edit') return 'Pencil';
  if (itemId === 'toggle') return isVisible ? 'Eye' : 'EyeOff';
  return 'Trash';
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleRemoveClick = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const {
    open,
    menuId,
    focusedIndex,
    menuItems,
    triggerRef,
    menuRef,
    itemRefs,
    setOpen,
    handleKeyDown,
  } = useLinkActionsMenu({
    onToggle,
    onRemove: handleRemoveClick,
    onEdit,
    isVisible,
    isOpen,
    onOpenChange,
  });

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
          ref={triggerRef}
          type='button'
          aria-label='Link actions'
          aria-expanded={open}
          aria-controls={menuId}
          aria-haspopup='menu'
          onClick={() => setOpen(!open)}
          onKeyDown={handleKeyDown}
          className='inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
        >
          <Icon name='MoreVertical' className='h-5 w-5 text-primary-token' />
        </button>
        <div className='sr-only'>Actions: edit, hide/show, delete</div>

        {open ? (
          <div
            ref={menuRef}
            id={menuId}
            role='menu'
            aria-label='Link actions menu'
            tabIndex={-1}
            className='absolute right-0 top-9 z-50 min-w-[140px] rounded-lg border border-subtle bg-surface-1 p-1 text-sm shadow-lg focus-visible:outline-none'
            onKeyDown={handleKeyDown}
          >
            {menuItems.map((item, index) => (
              <button
                key={item.id}
                ref={el => {
                  itemRefs.current[index] = el;
                }}
                type='button'
                role='menuitem'
                aria-label={item.label}
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(false);
                    item.action();
                  } else {
                    handleKeyDown(e);
                  }
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-secondary-token hover:text-primary-token hover:bg-surface-2 transition-all duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0',
                  item.id === 'remove' &&
                    'text-destructive hover:text-destructive/80',
                  focusedIndex === index && 'bg-surface-2'
                )}
              >
                <Icon
                  name={getMenuItemIcon(item.id, isVisible)}
                  className='h-4 w-4'
                />
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title='Delete link?'
        description='This action cannot be undone. The link will be permanently removed from your profile.'
        confirmLabel='Delete'
        variant='destructive'
        onConfirm={onRemove}
      />
    </div>
  );
});

LinkActions.displayName = 'LinkActions';
