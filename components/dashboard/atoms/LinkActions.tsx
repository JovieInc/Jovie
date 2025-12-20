'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
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
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const open = isOpen ?? openInternal;
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      else setOpenInternal(next);
      if (!next) {
        setFocusedIndex(null);
        // Restore focus to trigger
        triggerRef.current?.focus();
      }
    },
    [onOpenChange]
  );

  // Build menu items array
  const menuItems = [
    ...(onEdit ? [{ id: 'edit', label: 'Edit', action: onEdit }] : []),
    {
      id: 'toggle',
      label: isVisible ? 'Hide' : 'Show',
      action: onToggle,
    },
    { id: 'remove', label: 'Delete', action: onRemove },
  ];

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
          setFocusedIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => {
            const next =
              prev === null ? 0 : Math.min(prev + 1, menuItems.length - 1);
            itemRefs.current[next]?.focus();
            return next;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => {
            const next =
              prev === null ? menuItems.length - 1 : Math.max(prev - 1, 0);
            itemRefs.current[next]?.focus();
            return next;
          });
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          itemRefs.current[0]?.focus();
          break;
        case 'End':
          e.preventDefault();
          const lastIndex = menuItems.length - 1;
          setFocusedIndex(lastIndex);
          itemRefs.current[lastIndex]?.focus();
          break;
      }
    },
    [open, menuItems.length, setOpen]
  );

  // Focus first item when menu opens
  useEffect(() => {
    if (open && menuItems.length > 0) {
      setFocusedIndex(0);
      // Small delay to ensure menu is rendered
      setTimeout(() => {
        itemRefs.current[0]?.focus();
      }, 0);
    }
  }, [open, menuItems.length]);

  // Trap focus in menu when open
  useEffect(() => {
    if (!open || !menuRef.current) return;

    const handleFocus = (e: FocusEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        itemRefs.current[focusedIndex ?? 0]?.focus();
      }
    };

    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, [open, focusedIndex]);

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
                  name={
                    item.id === 'edit'
                      ? 'Pencil'
                      : item.id === 'toggle'
                        ? isVisible
                          ? 'Eye'
                          : 'EyeOff'
                        : 'Trash'
                  }
                  className='h-4 w-4'
                />
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

LinkActions.displayName = 'LinkActions';
