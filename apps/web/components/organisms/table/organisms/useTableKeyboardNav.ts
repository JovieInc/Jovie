import { useCallback, useEffect } from 'react';

/**
 * Configuration for table keyboard navigation
 */
export interface TableKeyboardNavConfig<TData> {
  /** Whether keyboard navigation is enabled */
  readonly enabled: boolean;
  /** Current focused row index */
  readonly focusedIndex: number;
  /** Total number of rows */
  readonly rowCount: number;
  /** Map of row index to DOM element */
  readonly rowRefsMap: Map<number, HTMLTableRowElement>;
  /** Handler for setting focused index */
  readonly setFocusedIndex: (index: number) => void;
  /** Optional handler when row is activated (Enter/Space) */
  readonly onRowClick?: (row: TData) => void;
}

/**
 * Return value from useTableKeyboardNav hook
 */
export interface TableKeyboardNavResult<TData> {
  /** Keyboard event handler for table rows */
  readonly handleKeyDown: (
    event: React.KeyboardEvent,
    rowIndex: number,
    rowData: TData
  ) => void;
}

/**
 * Custom hook for table keyboard navigation
 *
 * Handles arrow key navigation (up/down) and activation (Enter/Space).
 * Automatically scrolls focused rows into view.
 *
 * @param config - Keyboard navigation configuration
 * @returns Keyboard event handler
 *
 * @example
 * const { handleKeyDown } = useTableKeyboardNav({
 *   enabled: true,
 *   focusedIndex,
 *   rowCount: rows.length,
 *   rowRefsMap: rowRefs.current,
 *   setFocusedIndex,
 *   onRowClick,
 * });
 */
export function useTableKeyboardNav<TData>({
  enabled,
  focusedIndex,
  rowCount,
  rowRefsMap,
  setFocusedIndex,
  onRowClick,
}: TableKeyboardNavConfig<TData>): TableKeyboardNavResult<TData> {
  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, rowIndex: number, rowData: TData) => {
      if (!enabled) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (rowIndex < rowCount - 1) {
            const nextIndex = rowIndex + 1;
            setFocusedIndex(nextIndex);
            rowRefsMap.get(nextIndex)?.focus();
          }
          break;

        case 'ArrowUp':
          event.preventDefault();
          if (rowIndex > 0) {
            const prevIndex = rowIndex - 1;
            setFocusedIndex(prevIndex);
            rowRefsMap.get(prevIndex)?.focus();
          }
          break;

        case 'Enter':
        case ' ':
          event.preventDefault();
          onRowClick?.(rowData);
          break;
      }
    },
    [enabled, rowCount, setFocusedIndex, rowRefsMap, onRowClick]
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
