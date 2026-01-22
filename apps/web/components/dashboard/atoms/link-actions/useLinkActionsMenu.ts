'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MenuItem, UseLinkActionsMenuReturn } from './types';

interface UseLinkActionsMenuOptions {
  onToggle: () => void;
  onRemove: () => void;
  onEdit?: () => void;
  isVisible: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function useLinkActionsMenu({
  onToggle,
  onRemove,
  onEdit,
  isVisible,
  isOpen,
  onOpenChange,
}: UseLinkActionsMenuOptions): UseLinkActionsMenuReturn {
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
        triggerRef.current?.focus();
      }
    },
    [onOpenChange]
  );

  const menuItems: MenuItem[] = [
    ...(onEdit ? [{ id: 'edit', label: 'Edit', action: onEdit }] : []),
    {
      id: 'toggle',
      label: isVisible ? 'Hide' : 'Show',
      action: onToggle,
    },
    { id: 'remove', label: 'Delete', action: onRemove },
  ];

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
        case 'End': {
          e.preventDefault();
          const lastIndex = menuItems.length - 1;
          setFocusedIndex(lastIndex);
          itemRefs.current[lastIndex]?.focus();
          break;
        }
      }
    },
    [open, menuItems.length, setOpen]
  );

  useEffect(() => {
    if (open && menuItems.length > 0) {
      setFocusedIndex(0);
      setTimeout(() => {
        itemRefs.current[0]?.focus();
      }, 0);
    }
  }, [open, menuItems.length]);

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

  return {
    open,
    menuId,
    focusedIndex,
    menuItems,
    triggerRef,
    menuRef,
    itemRefs,
    setOpen,
    handleKeyDown,
  };
}
