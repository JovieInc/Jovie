'use client';

import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import React, { memo, useCallback } from 'react';
import { cn, presets } from '../table.styles';

export interface VirtualizedTableRowProps<TData> {
  readonly row: Row<TData>;
  readonly rowIndex: number;
  readonly rowRefsMap: Map<number, HTMLTableRowElement>;
  readonly shouldEnableKeyboardNav: boolean;
  readonly shouldVirtualize: boolean;
  readonly virtualStart?: number;
  readonly focusedIndex: number;
  readonly onRowClick?: (row: TData) => void;
  readonly onRowContextMenu?: (row: TData, event: React.MouseEvent) => void;
  readonly onKeyDown: (
    event: React.KeyboardEvent,
    rowIndex: number,
    rowData: TData
  ) => void;
  readonly onFocusChange: (index: number) => void;
  readonly getRowClassName?: (row: TData, index: number) => string;
  readonly measureElement?: (el: HTMLTableRowElement | null) => void;
}

/**
 * VirtualizedTableRow - Memoized row component for virtualized tables
 *
 * Features:
 * - Memoization to prevent unnecessary re-renders
 * - Virtualization support with absolute positioning
 * - Keyboard navigation support
 * - Context menu support
 * - Dynamic row measurement for variable heights
 *
 * This component is used internally by UnifiedTable and VirtualizedTableBody
 * to render individual table rows with optimal performance.
 */
function VirtualizedTableRowComponent<TData>({
  row,
  rowIndex,
  rowRefsMap,
  shouldEnableKeyboardNav,
  shouldVirtualize,
  virtualStart,
  focusedIndex,
  onRowClick,
  onRowContextMenu,
  onKeyDown,
  onFocusChange,
  getRowClassName,
  measureElement,
}: VirtualizedTableRowProps<TData>) {
  const rowData = row.original as TData;

  const handleClick = useCallback(() => {
    onRowClick?.(rowData);
    onFocusChange(rowIndex);
  }, [onRowClick, rowData, onFocusChange, rowIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => onKeyDown(e, rowIndex, rowData),
    [onKeyDown, rowIndex, rowData]
  );

  const handleFocusChange = useCallback(() => {
    if (shouldEnableKeyboardNav) {
      onFocusChange(rowIndex);
    }
  }, [shouldEnableKeyboardNav, onFocusChange, rowIndex]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => onRowContextMenu?.(rowData, e),
    [onRowContextMenu, rowData]
  );

  const handleRef = useCallback(
    (el: HTMLTableRowElement | null) => {
      if (el) {
        rowRefsMap.set(rowIndex, el);
      } else {
        rowRefsMap.delete(rowIndex);
      }
      if (shouldVirtualize && el && measureElement) {
        measureElement(el);
      }
    },
    [rowRefsMap, rowIndex, shouldVirtualize, measureElement]
  );

  return (
    <tr
      key={row.id}
      ref={handleRef}
      data-index={rowIndex}
      tabIndex={shouldEnableKeyboardNav ? 0 : undefined}
      className={cn(
        presets.tableRow,
        onRowClick && 'cursor-pointer',
        shouldEnableKeyboardNav &&
          'focus-visible:outline-none focus-visible:bg-surface-2',
        focusedIndex === rowIndex && 'bg-surface-2',
        getRowClassName?.(rowData, rowIndex)
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocusChange}
      onMouseEnter={handleFocusChange}
      onContextMenu={handleContextMenu}
      style={
        shouldVirtualize && virtualStart !== undefined
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualStart}px)`,
            }
          : undefined
      }
    >
      {row.getVisibleCells().map(cell => (
        <td
          key={cell.id}
          className={presets.tableCell}
          style={{
            width:
              cell.column.getSize() === 150 ? undefined : cell.column.getSize(),
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}

// Export the memoized component with proper generic typing
export const VirtualizedTableRow = memo(VirtualizedTableRowComponent) as <
  TData,
>(
  props: VirtualizedTableRowProps<TData>
) => React.ReactElement;
