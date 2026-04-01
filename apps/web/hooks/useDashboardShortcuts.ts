'use client';

import { useSequentialShortcuts } from '@/hooks/useSequentialShortcuts';

interface UseDashboardShortcutsOptions {
  /** Callback when shortcuts modal should open (Cmd+/) */
  readonly onOpenShortcutsModal?: () => void;
  /** Whether shortcuts are enabled */
  readonly enabled?: boolean;
}

/**
 * Single entry point for all dashboard-level keyboard shortcuts.
 *
 * Wraps `useSequentialShortcuts` for G-then-X navigation shortcuts
 * and Cmd+/ for the shortcuts modal.
 *
 * Component-level shortcuts (like filter 'F' key) remain in their
 * respective components — this hook handles shell-level shortcuts only.
 *
 * `useSidebarKeyboardShortcut` (Cmd+B) remains in the sidebar context
 * since it needs the sidebar toggle callback from that provider.
 */
export function useDashboardShortcuts({
  onOpenShortcutsModal,
  enabled = true,
}: UseDashboardShortcutsOptions = {}) {
  // Sequential navigation shortcuts (G then D, G then R, etc.)
  // Also handles Cmd+/ for shortcuts modal
  const { clearSequence } = useSequentialShortcuts({
    enabled,
    onOpenShortcutsModal,
  });

  return { clearSequence };
}
