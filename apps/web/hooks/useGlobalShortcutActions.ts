'use client';

/**
 * Wires the "advertised in the keyboard-shortcuts overlay but no obvious
 * owner" chords:
 *
 *   - Alt+T        → cycle theme (next-themes via useThemeToggle)
 *   - Alt+Shift+Q  → Clerk sign-out
 *
 * Sequential nav (G then X), Cmd+/, Cmd+B, Cmd+K all live in their own
 * hooks. This hook is mounted once inside `KeyboardShortcutsHandler` so the
 * overlay rows are no longer aspirational.
 *
 * Hook-order: every `useEffect` here is unconditional and runs once.
 */

import { useClerk } from '@clerk/nextjs';
import { useEffect } from 'react';
import { useThemeToggle } from '@/components/site/theme-toggle/useThemeToggle';
import { isFormElement } from '@/lib/utils/keyboard';

export function useGlobalShortcutActions() {
  const { cycleTheme } = useThemeToggle();
  const { signOut } = useClerk();

  // Alt+T → cycle theme (skip when typing in inputs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 't') return;
      if (isFormElement(e.target)) return;
      e.preventDefault();
      cycleTheme();
    }
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [cycleTheme]);

  // Alt+Shift+Q → Clerk sign-out.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (!e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) return;
      if (e.key.toLowerCase() !== 'q') return;
      if (isFormElement(e.target)) return;
      e.preventDefault();
      void signOut({ redirectUrl: '/' });
    }
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [signOut]);
}
