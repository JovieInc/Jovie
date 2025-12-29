'use client';

/**
 * Hook for managing disclosure state (modals, dialogs, drawers, etc.)
 * Reduces duplicated isOpen/setIsOpen patterns across components.
 */

import { useCallback, useState } from 'react';

export interface UseDisclosureReturn {
  /** Whether the disclosure is open */
  isOpen: boolean;
  /** Open the disclosure */
  open: () => void;
  /** Close the disclosure */
  close: () => void;
  /** Toggle the disclosure */
  toggle: () => void;
  /** Set the disclosure state directly */
  setIsOpen: (value: boolean) => void;
  /** Props to spread on the disclosure trigger */
  getTriggerProps: () => {
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'dialog';
  };
  /** Props to spread on the disclosure content */
  getContentProps: () => {
    open: boolean;
    onClose: () => void;
  };
}

export interface UseDisclosureOptions {
  /** Initial open state (default: false) */
  defaultOpen?: boolean;
  /** Callback when opened */
  onOpen?: () => void;
  /** Callback when closed */
  onClose?: () => void;
  /** Callback when toggled */
  onToggle?: (isOpen: boolean) => void;
}

/**
 * Hook for managing disclosure state (modals, dialogs, drawers).
 *
 * @example
 * ```tsx
 * const { isOpen, open, close, getContentProps } = useDisclosure();
 *
 * return (
 *   <>
 *     <button onClick={open}>Open Modal</button>
 *     <Dialog {...getContentProps()}>
 *       <DialogContent>Hello!</DialogContent>
 *     </Dialog>
 *   </>
 * );
 * ```
 *
 * @example With callbacks
 * ```tsx
 * const disclosure = useDisclosure({
 *   onOpen: () => track('modal_opened'),
 *   onClose: () => track('modal_closed'),
 * });
 * ```
 */
export function useDisclosure(
  options: UseDisclosureOptions = {}
): UseDisclosureReturn {
  const { defaultOpen = false, onOpen, onClose, onToggle } = options;

  const [isOpen, setIsOpenState] = useState(defaultOpen);

  const open = useCallback(() => {
    setIsOpenState(true);
    onOpen?.();
    onToggle?.(true);
  }, [onOpen, onToggle]);

  const close = useCallback(() => {
    setIsOpenState(false);
    onClose?.();
    onToggle?.(false);
  }, [onClose, onToggle]);

  const toggle = useCallback(() => {
    setIsOpenState(prev => {
      const next = !prev;
      if (next) {
        onOpen?.();
      } else {
        onClose?.();
      }
      onToggle?.(next);
      return next;
    });
  }, [onOpen, onClose, onToggle]);

  const setIsOpen = useCallback(
    (value: boolean) => {
      setIsOpenState(value);
      if (value) {
        onOpen?.();
      } else {
        onClose?.();
      }
      onToggle?.(value);
    },
    [onOpen, onClose, onToggle]
  );

  const getTriggerProps = useCallback(
    () => ({
      onClick: toggle,
      'aria-expanded': isOpen,
      'aria-haspopup': 'dialog' as const,
    }),
    [isOpen, toggle]
  );

  const getContentProps = useCallback(
    () => ({
      open: isOpen,
      onClose: close,
    }),
    [isOpen, close]
  );

  return {
    isOpen,
    open,
    close,
    toggle,
    setIsOpen,
    getTriggerProps,
    getContentProps,
  };
}

/**
 * Hook for managing multiple disclosures by key.
 * Useful for lists where each item might have its own modal/dropdown.
 *
 * @example
 * ```tsx
 * const { isOpen, open, close } = useDisclosureGroup<string>();
 *
 * return items.map(item => (
 *   <div key={item.id}>
 *     <button onClick={() => open(item.id)}>Edit</button>
 *     <Dialog open={isOpen(item.id)} onClose={() => close(item.id)}>
 *       Edit {item.name}
 *     </Dialog>
 *   </div>
 * ));
 * ```
 */
export function useDisclosureGroup<K extends string | number>() {
  const [openKeys, setOpenKeys] = useState<Set<K>>(new Set());

  const isOpen = useCallback((key: K) => openKeys.has(key), [openKeys]);

  const open = useCallback((key: K) => {
    setOpenKeys(prev => new Set(prev).add(key));
  }, []);

  const close = useCallback((key: K) => {
    setOpenKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const toggle = useCallback((key: K) => {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const closeAll = useCallback(() => {
    setOpenKeys(new Set());
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    closeAll,
    openKeys,
  };
}
