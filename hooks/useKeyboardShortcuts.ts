'use client';

import * as React from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  target?: HTMLElement | null;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, target } = options;

  React.useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return;
      // Don't trigger shortcuts when user is typing in inputs
      if (
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' ||
          event.target.tagName === 'TEXTAREA' ||
          event.target.contentEditable === 'true')
      ) {
        return;
      }

      const matchingShortcut = shortcuts.find(shortcut => {
        const isKeyMatch =
          shortcut.key.toLowerCase() === event.key.toLowerCase();
        const isCtrlMatch = !!shortcut.ctrlKey === event.ctrlKey;
        const isMetaMatch = !!shortcut.metaKey === event.metaKey;
        const isShiftMatch = !!shortcut.shiftKey === event.shiftKey;
        const isAltMatch = !!shortcut.altKey === event.altKey;

        return (
          isKeyMatch && isCtrlMatch && isMetaMatch && isShiftMatch && isAltMatch
        );
      });

      if (matchingShortcut) {
        if (matchingShortcut.preventDefault !== false) {
          event.preventDefault();
        }
        matchingShortcut.action();
      }
    };

    const element = target || document;
    element.addEventListener('keydown', handleKeyDown);

    return () => {
      element.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled, target]);

  // Helper to format shortcut display
  const formatShortcut = React.useCallback((shortcut: KeyboardShortcut) => {
    const parts: string[] = [];

    if (shortcut.ctrlKey) parts.push('Ctrl');
    if (shortcut.metaKey) parts.push('⌘');
    if (shortcut.shiftKey) parts.push('Shift');
    if (shortcut.altKey) parts.push('Alt');

    parts.push(shortcut.key.toUpperCase());

    return parts.join(' + ');
  }, []);

  return { formatShortcut };
}

// Hook for managing focus state across keyboard navigation
export function useFocusManager<T = HTMLElement>(
  items: T[],
  initialIndex = -1
) {
  const [focusedIndex, setFocusedIndex] = React.useState(initialIndex);

  const focusNext = React.useCallback(() => {
    setFocusedIndex(prev => (prev + 1) % items.length);
  }, [items.length]);

  const focusPrevious = React.useCallback(() => {
    setFocusedIndex(prev => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const focusFirst = React.useCallback(() => {
    setFocusedIndex(0);
  }, []);

  const focusLast = React.useCallback(() => {
    setFocusedIndex(items.length - 1);
  }, [items.length]);

  const clearFocus = React.useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  const focusItem = React.useCallback(
    (index: number) => {
      if (index >= 0 && index < items.length) {
        setFocusedIndex(index);
      }
    },
    [items.length]
  );

  return {
    focusedIndex,
    focusedItem: focusedIndex >= 0 ? items[focusedIndex] : null,
    focusNext,
    focusPrevious,
    focusFirst,
    focusLast,
    clearFocus,
    focusItem,
    hasFocus: focusedIndex >= 0,
  };
}
