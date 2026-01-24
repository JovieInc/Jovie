'use client';

/**
 * Memoized table row component for UnifiedTable
 *
 * Extracted from UnifiedTable for better code organization.
 * This component handles virtualized and non-virtualized rows with:
 * - Keyboard navigation support
 * - Focus management
 * - Context menu integration
 * - Ref management for scrolling
 */

import { type Cell, flexRender } from '@tanstack/react-table';
import React, { memo, useCallback } from 'react';
import { cn, presets } from '../table.styles';
import type { UnifiedTableRowProps } from '../types/unified-table.types';

/** Default column size used by TanStack Table when no size is specified */
const DEFAULT_COLUMN_SIZE = 150;

/**
 * Internal memoized row component to prevent inline handler recreation.
 * This is a generic component that works with TanStack Table's Row type.
 */
export const UnifiedTableRow = memo(function UnifiedTableRow<TData>({
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
}: UnifiedTableRowProps<TData>) {
  const rowData = row.original;

  const handleClick = useCallback(() => {
    onRowClick?.(rowData);
    onFocusChange(rowIndex);
  }, [onRowClick, rowData, onFocusChange, rowIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => onKeyDown(e, rowIndex, rowData),
    [onKeyDown, rowIndex, rowData]
  );

  const handleFocus = useCallback(() => {
    if (shouldEnableKeyboardNav) {
      onFocusChange(rowIndex);
    }
  }, [shouldEnableKeyboardNav, onFocusChange, rowIndex]);

  const handleMouseEnter = useCallback(() => {
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
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
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
      {row.getVisibleCells().map((cell: Cell<TData, unknown>) => (
        <td
          key={cell.id}
          className={presets.tableCell}
          style={{
            width:
              cell.column.getSize() !== DEFAULT_COLUMN_SIZE
                ? cell.column.getSize()
                : undefined,
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}) as <TData>(props: UnifiedTableRowProps<TData>) => React.ReactElement;
