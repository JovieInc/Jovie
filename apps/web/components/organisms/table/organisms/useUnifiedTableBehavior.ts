'use client';

import type { OnChangeFn, RowSelectionState } from '@tanstack/react-table';
import { useCallback, useEffect, useRef } from 'react';

interface RowInteractionEvent {
  readonly shiftKey: boolean;
}

export interface UnifiedTableBehaviorConfig<TData> {
  readonly enabled: boolean;
  readonly focusedIndex: number;
  readonly rowCount: number;
  readonly rowRefsMap: Map<number, HTMLTableRowElement>;
  readonly setFocusedIndex: (index: number) => void;
  readonly rows: TData[];
  readonly rowIds: string[];
  readonly rowSelection?: RowSelectionState;
  readonly onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  readonly onRowClick?: (row: TData) => void;
}

export interface UnifiedTableBehaviorResult<TData> {
  readonly handleKeyDown: (
    event: React.KeyboardEvent,
    rowIndex: number,
    rowData: TData
  ) => void;
  readonly handleRowClick: (
    rowIndex: number,
    rowData: TData,
    event: RowInteractionEvent
  ) => void;
}

export function useUnifiedTableBehavior<TData>({
  enabled,
  focusedIndex,
  rowCount,
  rowRefsMap,
  setFocusedIndex,
  rows,
  rowIds,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
}: UnifiedTableBehaviorConfig<TData>): UnifiedTableBehaviorResult<TData> {
  const rangeAnchorRef = useRef<number | null>(null);
  const canSelectRows = Boolean(
    onRowSelectionChange && rowIds.length === rowCount
  );

  const setSingleSelection = useCallback(
    (index: number) => {
      if (!canSelectRows) return;

      const rowId = rowIds[index];
      if (!rowId) return;

      onRowSelectionChange?.({ [rowId]: true });
      rangeAnchorRef.current = index;
    },
    [canSelectRows, rowIds, onRowSelectionChange]
  );

  const setRangeSelection = useCallback(
    (index: number) => {
      if (!canSelectRows) return;

      const anchorIndex = rangeAnchorRef.current;
      if (anchorIndex === null) {
        setSingleSelection(index);
        return;
      }

      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      const nextSelection: RowSelectionState = {};

      for (let i = start; i <= end; i += 1) {
        const rowId = rowIds[i];
        if (rowId) {
          nextSelection[rowId] = true;
        }
      }

      onRowSelectionChange?.(nextSelection);
    },
    [canSelectRows, onRowSelectionChange, rowIds, setSingleSelection]
  );

  const focusRow = useCallback(
    (index: number) => {
      setFocusedIndex(index);
      rowRefsMap.get(index)?.focus();
    },
    [setFocusedIndex, rowRefsMap]
  );

  const handleRowClick = useCallback(
    (rowIndex: number, rowData: TData, event: RowInteractionEvent) => {
      focusRow(rowIndex);

      if (event.shiftKey) {
        setRangeSelection(rowIndex);
      } else {
        setSingleSelection(rowIndex);
      }

      onRowClick?.(rowData);
    },
    [focusRow, onRowClick, setRangeSelection, setSingleSelection]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, rowIndex: number, rowData: TData) => {
      if (!enabled) return;

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          if (rowIndex >= rowCount - 1) return;

          const nextIndex = rowIndex + 1;
          focusRow(nextIndex);

          if (event.shiftKey) {
            setRangeSelection(nextIndex);
          } else {
            setSingleSelection(nextIndex);
          }

          const nextRow = rows[nextIndex];
          if (nextRow) {
            onRowClick?.(nextRow);
          }
          break;
        }

        case 'ArrowUp': {
          event.preventDefault();
          if (rowIndex <= 0) return;

          const previousIndex = rowIndex - 1;
          focusRow(previousIndex);

          if (event.shiftKey) {
            setRangeSelection(previousIndex);
          } else {
            setSingleSelection(previousIndex);
          }

          const previousRow = rows[previousIndex];
          if (previousRow) {
            onRowClick?.(previousRow);
          }
          break;
        }

        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (event.shiftKey) {
            setRangeSelection(rowIndex);
          } else {
            setSingleSelection(rowIndex);
          }
          onRowClick?.(rowData);
          break;
        }
      }
    },
    [
      enabled,
      rowCount,
      focusRow,
      setRangeSelection,
      setSingleSelection,
      rows,
      onRowClick,
    ]
  );

  useEffect(() => {
    if (focusedIndex >= 0 && enabled) {
      rowRefsMap
        .get(focusedIndex)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, enabled, rowRefsMap]);

  useEffect(() => {
    if (!canSelectRows) {
      rangeAnchorRef.current = null;
      return;
    }

    const selectedIds = Object.keys(rowSelection ?? {}).filter(
      rowId => rowSelection?.[rowId]
    );

    if (selectedIds.length === 1) {
      const selectedRowIndex = rowIds.findIndex(
        rowId => rowId === selectedIds[0]
      );
      if (selectedRowIndex >= 0) {
        rangeAnchorRef.current = selectedRowIndex;
      }
    }
  }, [canSelectRows, rowIds, rowSelection]);

  return {
    handleKeyDown,
    handleRowClick,
  };
}
