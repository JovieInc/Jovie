'use client';

/**
 * Wires the "advertised in the keyboard-shortcuts overlay but no obvious
 * owner" chords:
 *
 *   - Alt+T        → cycle theme (next-themes via useThemeToggle)
 *   - Alt+Shift+Q  → Clerk sign-out
 *   - Cmd/Ctrl+O   → toggle Ovie/Jovie talk door (entitled only)
 *
 * Sequential nav (G then X), Cmd+/, Cmd+B, Cmd+K all live in their own
 * hooks. This hook is mounted once inside `KeyboardShortcutsHandler` so the
 * overlay rows are no longer aspirational.
 *
 * Hook-order: every `useEffect` here is unconditional and runs once.
 */

import { usePathname, useRouter } from 'next/navigation';
import { useContext, useEffect } from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { useThemeToggle } from '@/components/site/theme-toggle/useThemeToggle';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import {
  APP_SHELL_WORKSPACES,
  getCurrentAppShellWorkspace,
  getNextAppShellWorkspace,
} from '@/lib/app-shell/workspaces';
import { resolveEntitledOvieDoorHref } from '@/lib/chat/ovie-door';
import {
  OVIE_DOOR_TOGGLE_KEY,
  WORKSPACE_SWITCH_KEY,
} from '@/lib/keyboard-shortcuts';
import { isFormElement } from '@/lib/utils/keyboard';

export function useGlobalShortcutActions() {
  const { cycleTheme } = useThemeToggle();
  const { signOut } = useAuthSafe();
  const dashboardData = useContext(DashboardDataContext);
  const isAdmin = dashboardData?.isAdmin ?? false;
  const pathname = usePathname();
  const router = useRouter();

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

  // Alt+Shift+W → cycle to the next authorized workspace.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isAdmin || e.isComposing) return;
      if (!e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) return;
      // Option modifies `event.key` into a symbol on macOS. Prefer the
      // physical key code so the displayed ⌥ ⇧ W binding works there, while
      // retaining `key` as a fallback for synthetic/older environments.
      if (e.code !== 'KeyW' && e.key.toLowerCase() !== WORKSPACE_SWITCH_KEY) {
        return;
      }
      if (isFormElement(e.target)) return;
      const currentWorkspace = getCurrentAppShellWorkspace(pathname);
      const nextWorkspace = getNextAppShellWorkspace(
        APP_SHELL_WORKSPACES,
        currentWorkspace.id
      );
      if (!nextWorkspace) return;
      e.preventDefault();
      router.push(nextWorkspace.href);
    }
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [isAdmin, pathname, router]);

  // Cmd/Ctrl+O → toggle Ovie/Jovie talk door. Entitled app-shell only so
  // customer Cmd+O (Open) is left alone. Modifier chords may fire in the
  // composer; a label-only switch is not a door flip.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return;
      const hasPrimaryModifier = e.metaKey || e.ctrlKey;
      if (!hasPrimaryModifier || e.altKey || e.shiftKey) return;
      if (e.metaKey && e.ctrlKey) return;
      if (e.code !== 'KeyO' && e.key.toLowerCase() !== OVIE_DOOR_TOGGLE_KEY) {
        return;
      }
      const href = resolveEntitledOvieDoorHref({
        entitled: isAdmin,
        pathname,
      });
      if (!href) return;
      e.preventDefault();
      router.push(href);
    }
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [isAdmin, pathname, router]);
}
