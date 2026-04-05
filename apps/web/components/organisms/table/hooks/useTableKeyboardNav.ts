'use client';

import { useCallback, useEffect, useState } from 'react';
import { resolveTableNavAction } from '../utils/tableKeyMap';

export interface UseTableKeyboardNavProps {
  readonly rowCount: number;
  readonly onRowActivate: (index: number) => void;
  readonly onRowSelect?: (index: number) => void;
  readonly initialFocusIndex?: number;
  readonly enabled?: boolean;
}

export interface UseTableKeyboardNavReturn {
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Alternative keyboard nav hook with internal focus state.
 *
 * Uses the shared tableKeyMap for consistent key bindings.
 * Prefer UnifiedTable's built-in keyboard nav where possible.
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

      const action = resolveTableNavAction(e.key, e.target);
      if (!action) return;

      switch (action) {
        case 'next':
          e.preventDefault();
          setFocusedIndex(prev => Math.min(prev + 1, rowCount - 1));
          break;

        case 'prev':
          e.preventDefault();
          setFocusedIndex(prev => Math.max(prev - 1, 0));
          break;

        case 'first':
          e.preventDefault();
          setFocusedIndex(0);
          break;

        case 'last':
          e.preventDefault();
          setFocusedIndex(rowCount - 1);
          break;

        case 'activate':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < rowCount) {
            onRowActivate(focusedIndex);
          }
          break;

        case 'toggle':
          e.preventDefault();
          if (onRowSelect && focusedIndex >= 0 && focusedIndex < rowCount) {
            onRowSelect(focusedIndex);
          }
          break;

        case 'close':
          // Let parent handle closing sidebar/drawer
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
