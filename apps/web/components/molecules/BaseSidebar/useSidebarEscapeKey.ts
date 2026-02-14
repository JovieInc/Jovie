'use client';

/**
 * useSidebarEscapeKey Hook
 *
 * Handles Escape key dismissal for sidebar components.
 */

import { useCallback, useEffect } from 'react';
import { isFormElement } from '@/lib/utils/keyboard';

export interface UseSidebarStateOptions {
  /** Whether the sidebar is open */
  isOpen: boolean;
  /** Callback when sidebar should close */
  onClose?: () => void;
  /** Whether to close on Escape key (default: true) */
  closeOnEscape?: boolean;
}

/**
 * Hook for managing sidebar keyboard interactions and state.
 */
export function useSidebarEscapeKey({
  isOpen,
  onClose,
  closeOnEscape = true,
}: UseSidebarStateOptions) {
  // Handle Escape key to close sidebar
  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isFormElement(event.target)) {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, closeOnEscape]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return {
    handleClose,
  };
}
