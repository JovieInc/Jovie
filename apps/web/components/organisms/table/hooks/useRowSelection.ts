'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type HeaderCheckboxState = boolean | 'indeterminate';

export interface UseRowSelectionResult {
  selectedIds: Set<string>;
  selectedCount: number;
  headerCheckboxState: HeaderCheckboxState;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  setSelection: (ids: Set<string>) => void;
  /**
   * Select a contiguous range of rows between two indices (inclusive).
   * Used for shift+click range selection.
   * @param fromIndex - Start of the range (the anchor row)
   * @param toIndex   - End of the range (the clicked row)
   * @param allRowIds - Ordered list of all visible row IDs
   */
  rangeSelect: (
    fromIndex: number,
    toIndex: number,
    allRowIds: string[]
  ) => void;
}

export function useRowSelection(rowIds: string[]): UseRowSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const rowIdSet = useMemo(() => new Set(rowIds), [rowIds]);

  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;

      let mutated = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (rowIdSet.has(id)) {
          next.add(id);
        } else {
          mutated = true;
        }
      });

      return mutated ? next : prev;
    });
  }, [rowIdSet]);

  const selectedCount = selectedIds.size;

  const allSelected = rowIds.length > 0 && selectedCount === rowIds.length;
  const someSelected = selectedCount > 0 && selectedCount < rowIds.length;

  // Determine header checkbox state without nested ternary
  let headerCheckboxState: HeaderCheckboxState;
  if (allSelected) {
    headerCheckboxState = true;
  } else if (someSelected) {
    headerCheckboxState = 'indeterminate';
  } else {
    headerCheckboxState = false;
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (rowIds.length === 0) return new Set<string>();
      if (prev.size === rowIds.length) return new Set<string>();
      return new Set(rowIds);
    });
  }, [rowIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const setSelection = useCallback((ids: Set<string>) => {
    setSelectedIds(ids);
  }, []);

  const rangeSelect = useCallback(
    (fromIndex: number, toIndex: number, allRowIds: string[]) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const id = allRowIds[i];
          if (id !== undefined) next.add(id);
        }
        return next;
      });
    },
    []
  );

  return {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    setSelection,
    rangeSelect,
  };
}
