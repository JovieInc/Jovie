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
 * Supports: Arrow Up/Down, j/k, Home/End, Enter, Space.
 */
export function useTableKeyboardNav<TData>({
  enabled,
  focusedIndex,
  rowCount,
  rowRefsMap,
  setFocusedIndex,
  onRowClick,
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

      const action = resolveTableNavAction(event.key, event.target);
      if (!action) return;

      switch (action) {
        case 'next':
          event.preventDefault();
          if (rowIndex < rowCount - 1) moveFocus(rowIndex + 1);
          break;

        case 'prev':
          event.preventDefault();
          if (rowIndex > 0) moveFocus(rowIndex - 1);
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
      }
    },
    [enabled, rowCount, moveFocus, onRowClick]
  );

  // Scroll focused row into view when it changes
  useEffect(() => {
    if (focusedIndex >= 0 && enabled) {
      const rowElement = rowRefsMap.get(focusedIndex);
      rowElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, enabled, rowRefsMap]);

  return { handleKeyDown };
}
