'use client';

import type * as React from 'react';
import { useEffect, useRef } from 'react';
import { isFormElement } from '@/lib/utils/keyboard';

export interface ShortcutConfig {
  key: string;
  handler: () => void;
  description: string;
  enabled?: boolean;
  preventDefault?: boolean;
}

export interface KeyboardShortcutOptions {
  readonly allowInInputs?: boolean;
  /** Limit shortcut handling to events originating inside this element subtree. */
  readonly scopeRef?: React.RefObject<HTMLElement | null>;
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
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: KeyboardShortcutOptions = {}
) {
  const shortcutsRef = useRef(shortcuts);
  const optionsRef = useRef(options);

  // Update ref in effect to avoid writing during render (React 19 guidance)
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.key) return;
      const { allowInInputs = false, scopeRef } = optionsRef.current;

      if (scopeRef && !scopeRef.current) {
        return;
      }

      if (scopeRef?.current) {
        const target = e.target;
        if (!(target instanceof Node) || !scopeRef.current.contains(target)) {
          return;
        }
      }

      // Build key string (e.g., "Meta+B", "Ctrl+Shift+A")
      const parts: string[] = [];
      const hasModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

      if (e.metaKey) parts.push('Meta');
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      parts.push(e.key);

      const key = parts.join('+');

      // Suppress single-key shortcuts when typing in form fields
      if (!allowInInputs && !hasModifier && isFormElement(e.target)) return;

      // Find matching shortcut that is enabled
      const match = shortcutsRef.current.find(
        s => s.key === key && s.enabled !== false
      );

      if (match) {
        if (match.preventDefault !== false) {
          e.preventDefault();
        }
        match.handler();
      }
    };

    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, []);
}
