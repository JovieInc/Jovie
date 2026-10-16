'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '@/lib/keyboard-shortcuts';
import { isShellShortcutSuppressed } from '@/lib/utils/keyboard';

/**
 * Configuration for sequential shortcuts hook
 */
interface UseSequentialShortcutsConfig {
  /** Whether shortcuts are enabled */
  enabled?: boolean;
  /** Timeout in ms for sequence (default: 1500ms) */
  sequenceTimeout?: number;
  /** Callback when shortcuts modal should open */
  onOpenShortcutsModal?: () => void;
}

/**
 * Hook for handling sequential keyboard shortcuts (e.g., "G then D")
 * and modifier-based shortcuts (e.g., "Cmd+/")
 *
 * Implements the Linear-style "G then X" navigation pattern where:
 * - Press "G" to start a sequence
 * - Then press a second key within timeout to navigate
 *
 * Also handles standard modifier shortcuts like Cmd+/ for the shortcuts modal.
 */
export function useSequentialShortcuts({
  enabled = true,
  sequenceTimeout = 1500,
  onOpenShortcutsModal,
}: UseSequentialShortcutsConfig = {}) {
  const router = useRouter();
  const sequenceStartRef = useRef<{
    key: string;
    target: EventTarget | null;
  } | null>(null);
  const sequenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear sequence state
  const clearSequence = useCallback(() => {
    sequenceStartRef.current = null;
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
      sequenceTimeoutRef.current = null;
    }
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || isShellShortcutSuppressed(event) || !event.key) {
        clearSequence();
        return;
      }
      const key = event.key.toLowerCase();

      // `?` (Shift+/) — Linear's single-key shortcut to open help.
      // Checked before the modifier branch since `?` is Shift-only.
      if (
        key === '?' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        onOpenShortcutsModal
      ) {
        clearSequence();
        event.preventDefault();
        onOpenShortcutsModal();
        return;
      }

      // Handle modifier-based shortcuts first
      if (event.metaKey || event.ctrlKey) {
        clearSequence();
        // Cmd/Ctrl + / opens shortcuts modal
        if (
          key === '/' &&
          !event.altKey &&
          !event.shiftKey &&
          onOpenShortcutsModal
        ) {
          event.preventDefault();
          onOpenShortcutsModal();
          return;
        }

        // Cmd/Ctrl + B toggles sidebar (handled by useSidebarKeyboardShortcut)
        // Don't interfere with it here
        return;
      }

      if (event.altKey || event.shiftKey) {
        clearSequence();
        return;
      }

      const target = event.composedPath()[0] ?? event.target;
      if (
        sequenceStartRef.current &&
        sequenceStartRef.current.target !== target
      ) {
        clearSequence();
      }

      // Handle sequential shortcuts
      const sequentialShortcuts = KEYBOARD_SHORTCUTS.filter(
        s => s.isSequential
      );

      // Check if this is the start of a sequence
      if (!sequenceStartRef.current) {
        // Check if this key starts any sequence
        const startsSequence = sequentialShortcuts.some(
          s => s.firstKey === key
        );

        if (startsSequence) {
          event.preventDefault();
          sequenceStartRef.current = { key, target };

          // Set timeout to clear sequence
          sequenceTimeoutRef.current = setTimeout(() => {
            clearSequence();
          }, sequenceTimeout);
        }
        return;
      }

      // We're in a sequence, check for matching second key
      const matches = sequentialShortcuts.filter(
        s =>
          s.firstKey === sequenceStartRef.current?.key &&
          s.secondKey === key &&
          s.href
      );

      // Ambiguous active bindings fail closed instead of using registration order.
      const matchingShortcut = matches.length === 1 ? matches[0] : undefined;
      if (matchingShortcut?.href) {
        event.preventDefault();
        clearSequence();
        router.push(matchingShortcut.href);
        return;
      }

      // No match, clear sequence
      clearSequence();
    },
    [enabled, onOpenShortcutsModal, clearSequence, sequenceTimeout, router]
  );

  useEffect(() => {
    if (!enabled) return;

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('blur', clearSequence);
    globalThis.addEventListener('compositionstart', clearSequence);
    globalThis.addEventListener('focusin', clearSequence);
    globalThis.addEventListener('pointerdown', clearSequence);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('blur', clearSequence);
      globalThis.removeEventListener('compositionstart', clearSequence);
      globalThis.removeEventListener('focusin', clearSequence);
      globalThis.removeEventListener('pointerdown', clearSequence);
      clearSequence();
    };
  }, [enabled, handleKeyDown, clearSequence]);

  return {
    clearSequence,
  };
}
