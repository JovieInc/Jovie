'use client';

import { useCallback, useEffect } from 'react';
import { resolveTableNavAction } from '../utils/tableKeyMap';

export interface TableKeyboardNavConfig<TData> {
  readonly enabled: boolean;
  readonly focusedIndex: number;
  readonly rowCount: number;
  readonly rowRefsMap: Map<number, HTMLTableRowElement>;
  readonly setFocusedIndex: (index: number) => void;
  readonly onRowClick?: (row: TData) => void;
  /** Toggles one row's selection (`x`). Omit when the table has no selection. */
  readonly onToggleSelection?: (rowIndex: number) => void;
  /**
   * Adds both rows to the selection (Shift+J/K, Shift+Arrow) before focus
   * moves, so repeated presses grow a contiguous range.
   */
  readonly onExtendSelection?: (fromIndex: number, toIndex: number) => void;
}

export interface TableKeyboardNavResult<TData> {
  readonly handleKeyDown: (
    event: React.KeyboardEvent,
    rowIndex: number,
    rowData: TData
  ) => void;
}

/**
 * Unified keyboard navigation for UnifiedTable rows.
 *
 * Uses the shared tableKeyMap for consistent key bindings across all tables.
 * Supports: Arrow Up/Down, j/k, Home/End, Enter, Space, plus `x` to toggle
 * selection and Shift+J/K (or Shift+Arrow) to extend it when selection exists.
 */
export function useTableKeyboardNav<TData>({
  enabled,
  focusedIndex,
  rowCount,
  rowRefsMap,
  setFocusedIndex,
  onRowClick,
  onToggleSelection,
  onExtendSelection,
}: TableKeyboardNavConfig<TData>): TableKeyboardNavResult<TData> {
  const moveFocus = useCallback(
    (nextIndex: number) => {
      setFocusedIndex(nextIndex);
      rowRefsMap.get(nextIndex)?.focus();
    },
    [setFocusedIndex, rowRefsMap]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, rowIndex: number, rowData: TData) => {
      if (!enabled) return;

      // Shifted letter selection belongs to these rows. Other consumers of
      // the shared mapper retain their ordinary j/k bindings.
      const key =
        event.shiftKey && (event.key === 'J' || event.key === 'K')
          ? event.key.toLowerCase()
          : event.key;
      const action = resolveTableNavAction(key, event.target);
      if (!action) return;

      const extend = event.shiftKey ? onExtendSelection : undefined;

      switch (action) {
        case 'next':
          event.preventDefault();
          if (rowIndex < rowCount - 1) {
            extend?.(rowIndex, rowIndex + 1);
            moveFocus(rowIndex + 1);
          }
          break;

        case 'prev':
          event.preventDefault();
          if (rowIndex > 0) {
            extend?.(rowIndex, rowIndex - 1);
            moveFocus(rowIndex - 1);
          }
          break;

        case 'first':
          event.preventDefault();
          moveFocus(0);
          break;

        case 'last':
          event.preventDefault();
          moveFocus(rowCount - 1);
          break;

        case 'activate':
        case 'toggle':
          event.preventDefault();
          onRowClick?.(rowData);
          break;

        case 'select':
          if (!onToggleSelection) return;
          event.preventDefault();
          onToggleSelection(rowIndex);
          break;
      }
    },
    [
      enabled,
      rowCount,
      moveFocus,
      onRowClick,
      onToggleSelection,
      onExtendSelection,
    ]
  );

  // Scroll focused row into view when it changes
  useEffect(() => {
    if (focusedIndex >= 0 && enabled) {
      const rowElement = rowRefsMap.get(focusedIndex);
      const prefersReducedMotion = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      rowElement?.scrollIntoView?.({
        block: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [focusedIndex, enabled, rowRefsMap]);

  return { handleKeyDown };
}
