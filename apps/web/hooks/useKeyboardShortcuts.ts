'use client';

import { useEffect, useRef } from 'react';

export interface ShortcutConfig {
  key: string;
  handler: () => void;
  description: string;
  enabled?: boolean;
}

/**
 * useKeyboardShortcuts - Standardized keyboard shortcuts across all sections
 *
 * Registers keyboard shortcuts with proper modifier key handling.
 * Supports Meta (Cmd on Mac), Ctrl, Shift, and Alt modifiers.
 *
 * Example key strings:
 * - "Meta+B" or "Ctrl+B" for Cmd/Ctrl + B
 * - "Meta+Shift+A" for Cmd/Ctrl + Shift + A
 * - "Escape" for Escape key
 * - "Meta+/" for Cmd/Ctrl + /
 *
 * Usage:
 * ```tsx
 * useKeyboardShortcuts([
 *   {
 *     key: 'Meta+B',
 *     description: 'Toggle sidebar',
 *     handler: () => toggleSidebar(),
 *   },
 *   {
 *     key: 'Escape',
 *     description: 'Close drawer',
 *     handler: () => closeDrawer(),
 *     enabled: drawerOpen,
 *   },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const shortcutsRef = useRef(shortcuts);

  // Update ref in effect to avoid writing during render (React 19 guidance)
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Build key string (e.g., "Meta+B", "Ctrl+Shift+A")
      const parts: string[] = [];

      if (e.metaKey) parts.push('Meta');
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      parts.push(e.key);

      const key = parts.join('+');

      // Find matching shortcut that is enabled
      const match = shortcutsRef.current.find(
        s => s.key === key && s.enabled !== false
      );

      if (match) {
        e.preventDefault();
        match.handler();
      }
    };

    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, []);
}

/**
 * Global shortcuts that should work across all sections
 * These will be registered at the AuthShell level
 */
export const createGlobalShortcuts = (
  toggleSidebar: () => void,
  closeDrawer: () => void,
  openShortcutsHelp: () => void
): ShortcutConfig[] => [
  {
    key: 'Meta+B',
    description: 'Toggle sidebar',
    handler: toggleSidebar,
  },
  {
    key: 'Ctrl+B',
    description: 'Toggle sidebar',
    handler: toggleSidebar,
  },
  {
    key: 'Escape',
    description: 'Close drawer/modal',
    handler: closeDrawer,
  },
  {
    key: 'Meta+/',
    description: 'Show keyboard shortcuts',
    handler: openShortcutsHelp,
  },
  {
    key: 'Ctrl+/',
    description: 'Show keyboard shortcuts',
    handler: openShortcutsHelp,
  },
];
