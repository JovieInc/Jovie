'use client';

import { type RefObject, useEffect } from 'react';
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
  /**
   * Called when Enter is pressed and a row is currently selected.
   * Used to "drill in" to a selected item (e.g., open track detail for a
   * selected release). When omitted, Enter is not handled.
   */
  readonly onActivate?: (index: number) => void;
  /**
   * Optional ref to the list container element. When provided, J/K/Arrow
   * navigation only fires if focus is within the container, on the document
   * body, or on no element at all — preventing the list from stealing keys
   * when the user has explicitly focused a different interactive region
   * (e.g., the header search, another panel, a sidebar input).
   */
  readonly containerRef?: RefObject<HTMLElement | null>;
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
 *
 * When `containerRef` is provided, J/K/Arrow also bail out if focused element
 * is outside the container and not the body — scoping nav to the list region.
 * Enter (activate) is always scoped: it only fires when `selectedIndex` is set
 * and focus is within the container, on the body, or unset.
 */
export function useAmbientListSelection({
  enabled,
  count,
  selectedIndex,
  onSelect,
  onActivate,
  containerRef,
}: UseAmbientListSelectionParams) {
  useEffect(() => {
    if (!enabled || count === 0) return;

    function isFocusOutsideContainer(target: EventTarget | null): boolean {
      if (!containerRef?.current) return false;
      if (!(target instanceof Element)) return false;
      // Allow body — ambient (no focused element).
      if (target === document.body) return false;
      return !containerRef.current.contains(target);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isInteractiveOverlayTarget(event.target)) return;

      const action = resolveTableNavAction(event.key, event.target);
      if (action === null) return;

      // Activate (Enter) drill-in: open the currently selected item.
      if (action === 'activate') {
        if (onActivate && selectedIndex !== null) {
          // Only fire when focus is ambient (body/container); don't steal
          // Enter from other interactive elements outside the list.
          if (!isFocusOutsideContainer(event.target)) {
            event.preventDefault();
            onActivate(selectedIndex);
          }
        }
        return;
      }

      // J/K/Arrow/Home/End navigation: scope to container when ref provided.
      if (isFocusOutsideContainer(event.target)) return;

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
  }, [enabled, count, selectedIndex, onSelect, onActivate, containerRef]);
}
