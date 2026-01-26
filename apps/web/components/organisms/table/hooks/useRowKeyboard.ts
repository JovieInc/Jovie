'use client';

/**
 * useRowKeyboard Hook
 *
 * Provides keyboard navigation logic for table rows.
 * Handles arrow key navigation and Enter/Space selection.
 *
 * @example
 * const { focusedIndex, setFocusedIndex, handleKeyDown } = useRowKeyboard({
 *   rowCount: rows.length,
 *   onRowClick,
 *   rowRefs,
 *   enabled: true,
 * });
 */

import { useCallback, useEffect, useState } from 'react';

export interface UseRowKeyboardOptions<TData> {
  /** Total number of rows in the table */
  rowCount: number;
  /** Callback when a row is activated (Enter/Space) */
  onRowClick?: (row: TData) => void;
  /** Map of row indices to DOM elements for focus management */
  rowRefs: React.RefObject<Map<number, HTMLTableRowElement>>;
  /** Enable/disable keyboard navigation */
  enabled: boolean;
  /** Controlled focused index (optional) */
  controlledFocusedIndex?: number;
  /** Callback when focused row changes (for controlled mode) */
  onFocusedRowChange?: (index: number) => void;
}

export interface UseRowKeyboardResult<TData> {
  /** Currently focused row index (-1 if none) */
  focusedIndex: number;
  /** Set the focused row index */
  setFocusedIndex: (index: number) => void;
  /** Keyboard event handler for rows */
  handleKeyDown: (
    event: React.KeyboardEvent,
    rowIndex: number,
    rowData: TData
  ) => void;
}

/**
 * Hook for managing keyboard navigation in tables.
 *
 * Supports both controlled and uncontrolled modes:
 * - Controlled: Pass controlledFocusedIndex and onFocusedRowChange
 * - Uncontrolled: Uses internal state
 */
export function useRowKeyboard<TData>({
  rowCount,
  onRowClick,
  rowRefs,
  enabled,
  controlledFocusedIndex,
  onFocusedRowChange,
}: UseRowKeyboardOptions<TData>): UseRowKeyboardResult<TData> {
  // Internal focused row state (uncontrolled mode)
  const [internalFocusedIndex, setInternalFocusedIndex] = useState<number>(-1);

  // Use controlled or uncontrolled focus
  const focusedIndex = controlledFocusedIndex ?? internalFocusedIndex;

  const setFocusedIndex = useCallback(
    (index: number) => {
      if (onFocusedRowChange) {
        onFocusedRowChange(index);
      } else {
        setInternalFocusedIndex(index);
      }
    },
    [onFocusedRowChange]
  );

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
            rowRefs.current?.get(nextIndex)?.focus();
          }
          break;
        case 'ArrowUp':
          event.preventDefault();
          if (rowIndex > 0) {
            const prevIndex = rowIndex - 1;
            setFocusedIndex(prevIndex);
            rowRefs.current?.get(prevIndex)?.focus();
          }
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          onRowClick?.(rowData);
          break;
      }
    },
    [enabled, rowCount, setFocusedIndex, onRowClick, rowRefs]
  );

  // Scroll focused row into view when it changes
  useEffect(() => {
    if (focusedIndex >= 0 && enabled) {
      const rowElement = rowRefs.current?.get(focusedIndex);
      rowElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, enabled, rowRefs]);

  return {
    focusedIndex,
    setFocusedIndex,
    handleKeyDown,
  };
}
