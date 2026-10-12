'use client';

import { useCallback, useEffect, useRef } from 'react';
import { resolveTableNavAction } from '../utils/tableKeyMap';

export interface TableKeyboardNavConfig<TData> {
  readonly enabled: boolean;
  readonly focusedIndex: number;
  readonly rowCount: number;
  readonly rowRefsMap: Map<number, HTMLTableRowElement>;
  /** Virtualizer handoff for keyboard destinations outside the mounted window. */
  readonly revealRow?: (index: number) => void;
  readonly renderedRowWindow?: string;
  readonly focusScope?: unknown;
  readonly setFocusedIndex: (index: number) => void;
  readonly onRowClick?: (row: TData) => void;
  /** Space; falls back to `onRowClick` when omitted. */
  readonly onRowToggle?: (row: TData) => void;
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
  revealRow,
  renderedRowWindow,
  focusScope,
  onRowClick,
  onRowToggle,
  onToggleSelection,
  onExtendSelection,
}: TableKeyboardNavConfig<TData>): TableKeyboardNavResult<TData> {
  const pendingFocus = useRef<{
    index: number;
    origin: Element | null;
    scope: unknown;
  } | null>(null);
  const moveFocus = useCallback(
    (nextIndex: number) => {
      pendingFocus.current = null;
      setFocusedIndex(nextIndex);
      const row = rowRefsMap.get(nextIndex);
      if (row) {
        row.focus({ preventScroll: true });
        row.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
      } else if (revealRow) {
        pendingFocus.current = {
          index: nextIndex,
          origin: document.activeElement,
          scope: focusScope,
        };
        revealRow(nextIndex);
      }
    },
    [setFocusedIndex, rowRefsMap, revealRow, focusScope]
  );

  // Complete only an owned keyboard request after the virtual destination mounts.
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    const focusOwned =
      document.activeElement === request.origin ||
      (document.activeElement === document.body &&
        !request.origin?.isConnected);
    if (
      !enabled ||
      request.index !== focusedIndex ||
      request.index >= rowCount ||
      request.scope !== focusScope ||
      !focusOwned
    ) {
      pendingFocus.current = null;
      return;
    }
    const row = rowRefsMap.get(request.index);
    if (row) {
      pendingFocus.current = null;
      row.focus({ preventScroll: true });
    }
  }, [
    enabled,
    focusedIndex,
    rowCount,
    rowRefsMap,
    renderedRowWindow,
    focusScope,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, rowIndex: number, rowData: TData) => {
      if (!enabled || rowCount === 0) return;

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
        case 'prev': {
          event.preventDefault();
          const nextIndex = rowIndex + (action === 'next' ? 1 : -1);
          if (nextIndex >= 0 && nextIndex < rowCount) {
            extend?.(rowIndex, nextIndex);
            moveFocus(nextIndex);
          }
          break;
        }

        case 'first':
        case 'last':
          event.preventDefault();
          moveFocus(action === 'first' ? 0 : rowCount - 1);
          break;

        case 'activate':
          event.preventDefault();
          onRowClick?.(rowData);
          break;

        case 'toggle':
          event.preventDefault();
          (onRowToggle ?? onRowClick)?.(rowData);
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
      onRowToggle,
      onToggleSelection,
      onExtendSelection,
    ]
  );

  return { handleKeyDown };
}
