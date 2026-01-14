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

  const headerCheckboxState: HeaderCheckboxState = allSelected
    ? true
    : someSelected
      ? 'indeterminate'
      : false;

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

  return {
    selectedIds,
    selectedCount,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    setSelection,
  };
}
