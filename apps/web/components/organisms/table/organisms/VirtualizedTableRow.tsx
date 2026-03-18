'use client';

import type { Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { cn, presets } from '../table.styles';

/**
 * Props that VirtualizedTableRow manages internally.
 * These are omitted from the spread so parent wrappers (e.g. Radix asChild)
 * cannot accidentally override row behaviour.
 */
type ManagedTrProps =
  | 'onClick'
  | 'onKeyDown'
  | 'onFocus'
  | 'onMouseEnter'
  | 'style'
  | 'className'
  | 'tabIndex';

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
  /**
   * Called when the row is shift-clicked.
   * The parent is responsible for computing the range and updating selection.
   * @param rowIndex - The index of the clicked row
   * @param rowData  - The data of the clicked row
   */
  readonly onRowShiftClick?: (rowIndex: number, rowData: TData) => void;
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
 * - Shift+click range selection support
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
  onRowShiftClick,
  ...htmlProps
}: VirtualizedTableRowProps<TData> &
  Omit<React.ComponentPropsWithoutRef<'tr'>, ManagedTrProps>) {
  const rowData = row.original as TData;

  // Keep a ref to the forwarded onContextMenu so we can compose it without
  // breaking memoisation of handleContextMenu.
  const forwardedContextMenuRef = useRef(htmlProps.onContextMenu);
  useEffect(() => {
    forwardedContextMenuRef.current = htmlProps.onContextMenu;
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey && onRowShiftClick) {
        e.preventDefault();
        onRowShiftClick(rowIndex, rowData);
      } else {
        onRowClick?.(rowData);
      }
      onFocusChange(rowIndex);
    },
    [onRowClick, onRowShiftClick, rowData, onFocusChange, rowIndex]
  );

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
    (e: React.MouseEvent<HTMLTableRowElement>) => {
      // Right-click should focus/select the row before opening actions so
      // side panels and contextual action menus stay in sync.
      onRowClick?.(rowData);
      onFocusChange(rowIndex);
      onRowContextMenu?.(rowData, e);
      // Forward to parent handler (e.g. Radix ContextMenu.Trigger via asChild)
      forwardedContextMenuRef.current?.(e);
    },
    [onRowClick, rowData, onFocusChange, rowIndex, onRowContextMenu]
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
      {...htmlProps}
      key={row.id}
      ref={handleRef}
      data-index={rowIndex}
      tabIndex={shouldEnableKeyboardNav ? 0 : undefined}
      className={cn(
        presets.tableRow,
        onRowClick && 'cursor-pointer',
        shouldEnableKeyboardNav &&
          'focus-visible:outline-none focus-visible:bg-(--linear-row-hover) focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_45%,transparent)]',
        focusedIndex === rowIndex &&
          'bg-(--linear-row-hover) shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_35%,transparent)]',
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
      {row.getVisibleCells().map(cell => {
        const metaClassName = (
          cell.column.columnDef.meta as { className?: string } | undefined
        )?.className;
        return (
          <td
            key={cell.id}
            className={cn(presets.tableCell, metaClassName)}
            style={{
              width:
                cell.column.getSize() === 150
                  ? undefined
                  : cell.column.getSize(),
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

// Export the memoized component with proper generic typing
export const VirtualizedTableRow = memo(VirtualizedTableRowComponent) as <
  TData,
>(
  props: VirtualizedTableRowProps<TData> &
    Omit<React.ComponentPropsWithoutRef<'tr'>, ManagedTrProps>
) => React.ReactElement;
