'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { KEYBOARD_SHORTCUTS } from '@/lib/keyboard-shortcuts';

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
  const sequenceStartRef = useRef<string | null>(null);
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
      if (!enabled) return;

      // Ignore if typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      // Handle modifier-based shortcuts first
      if (event.metaKey || event.ctrlKey) {
        // Cmd/Ctrl + / opens shortcuts modal
        if (key === '/' && onOpenShortcutsModal) {
          event.preventDefault();
          onOpenShortcutsModal();
          return;
        }

        // Cmd/Ctrl + B toggles sidebar (handled by useSidebarKeyboardShortcut)
        // Don't interfere with it here
        return;
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
          sequenceStartRef.current = key;

          // Set timeout to clear sequence
          sequenceTimeoutRef.current = setTimeout(() => {
            clearSequence();
          }, sequenceTimeout);
        }
        return;
      }

      // We're in a sequence, check for matching second key
      const matchingShortcut = sequentialShortcuts.find(
        s =>
          s.firstKey === sequenceStartRef.current &&
          s.secondKey === key &&
          s.href
      );

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

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearSequence();
    };
  }, [enabled, handleKeyDown, clearSequence]);

  return {
    clearSequence,
  };
}
