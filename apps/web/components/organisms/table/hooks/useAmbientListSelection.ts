'use client';

import { useEffect } from 'react';
import {
  isInteractiveOverlayTarget,
  resolveTableNavAction,
} from '../utils/tableKeyMap';

export interface UseAmbientListSelectionParams {
  /**
   * When `false`, the document-level listener is detached so the list does not
   * compete with other surfaces for keyboard ownership.
   */
  readonly enabled: boolean;
  /** Number of currently visible rows. */
  readonly count: number;
  /**
   * Current selected row index (0-based) or `null` when nothing is selected.
   * Used to compute the next/prev target when J/K/Arrow are pressed.
   */
  readonly selectedIndex: number | null;
  /** Called with the resolved row index when a navigation key fires. */
  readonly onSelect: (index: number) => void;
}

/**
 * Document-level keyboard navigation for ambient list selection (J/K, ArrowUp,
 * ArrowDown, Home, End). Used by Linear-style shell views (releases, tasks) so
 * navigation works without the row tree having focus.
 *
 * Bails out for: modifier-key combos, defaultPrevented events, form-element
 * targets (handled by `resolveTableNavAction`), and Radix overlay surfaces
 * (dialog, alertdialog, menu, popover, combobox listbox) so we never steal
 * keys from a focused drawer, dropdown, command palette, or input.
 */
export function useAmbientListSelection({
  enabled,
  count,
  selectedIndex,
  onSelect,
}: UseAmbientListSelectionParams) {
  useEffect(() => {
    if (!enabled || count === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isInteractiveOverlayTarget(event.target)) return;

      const action = resolveTableNavAction(event.key, event.target);
      if (action === null) return;

      switch (action) {
        case 'next': {
          event.preventDefault();
          if (selectedIndex === null) {
            onSelect(0);
            return;
          }
          onSelect(Math.min(selectedIndex + 1, count - 1));
          return;
        }
        case 'prev': {
          event.preventDefault();
          if (selectedIndex === null) {
            onSelect(count - 1);
            return;
          }
          onSelect(Math.max(selectedIndex - 1, 0));
          return;
        }
        case 'first': {
          event.preventDefault();
          onSelect(0);
          return;
        }
        case 'last': {
          event.preventDefault();
          onSelect(count - 1);
          return;
        }
        default:
          return;
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, count, selectedIndex, onSelect]);
}
