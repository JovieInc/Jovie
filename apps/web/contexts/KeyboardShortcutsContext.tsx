'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface KeyboardShortcutsContextValue {
  /** Whether the shortcuts modal is open */
  isOpen: boolean;
  /** Open the shortcuts modal */
  open: () => void;
  /** Close the shortcuts modal */
  close: () => void;
  /** Toggle the shortcuts modal */
  toggle: () => void;
}

const KeyboardShortcutsContext =
  createContext<KeyboardShortcutsContextValue | null>(null);

/**
 * Provider for keyboard shortcuts modal state
 * Place this at a high level in the component tree to enable
 * the shortcuts modal from anywhere in the app.
 */
export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
    }),
    [isOpen, open, close, toggle]
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

/**
 * Hook to access keyboard shortcuts modal state
 * @throws Error if used outside KeyboardShortcutsProvider
 */
export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new TypeError(
      'useKeyboardShortcuts must be used within a KeyboardShortcutsProvider'
    );
  }
  return context;
}

/**
 * Hook to safely access keyboard shortcuts context
 * Returns null if not within provider (useful for optional usage)
 */
export function useKeyboardShortcutsSafe() {
  return useContext(KeyboardShortcutsContext);
}
