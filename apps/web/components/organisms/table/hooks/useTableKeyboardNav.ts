'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseTableKeyboardNavProps {
  rowCount: number;
  onRowActivate: (index: number) => void;
  onRowSelect?: (index: number) => void;
  initialFocusIndex?: number;
  enabled?: boolean;
}

export interface UseTableKeyboardNavReturn {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Hook for managing keyboard navigation in tables
 *
 * Supports:
 * - Arrow Up/Down: Navigate between rows
 * - Spacebar: Toggle row selection (if selectable)
 * - Enter: Activate row (open sidebar/drawer)
 * - Home/End: Jump to first/last row
 * - Escape: Handled by parent (close sidebar)
 *
 * @example
 * ```tsx
 * const { focusedIndex, handleKeyDown } = useTableKeyboardNav({
 *   rowCount: data.length,
 *   onRowActivate: (index) => setSelectedRow(data[index]),
 *   onRowSelect: (index) => toggleRowSelection(data[index].id),
 * });
 * ```
 */
export function useTableKeyboardNav({
  rowCount,
  onRowActivate,
  onRowSelect,
  initialFocusIndex = -1,
  enabled = true,
}: UseTableKeyboardNavProps): UseTableKeyboardNavReturn {
  const [focusedIndex, setFocusedIndex] = useState(initialFocusIndex);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, rowCount - 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < rowCount) {
            onRowActivate(focusedIndex);
          }
          break;

        case ' ':
          e.preventDefault();
          if (onRowSelect && focusedIndex >= 0 && focusedIndex < rowCount) {
            onRowSelect(focusedIndex);
          }
          break;

        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;

        case 'End':
          e.preventDefault();
          setFocusedIndex(rowCount - 1);
          break;

        case 'Escape':
          // Let parent handle closing sidebar/drawer
          break;

        default:
          break;
      }
    },
    [enabled, focusedIndex, rowCount, onRowActivate, onRowSelect]
  );

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const row = document.querySelector(
        `tr[data-row-index="${focusedIndex}"]`
      );
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);

  return {
    focusedIndex,
    setFocusedIndex,
    handleKeyDown,
  };
}
