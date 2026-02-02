import {
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from '@tanstack/react-virtual';
import { type RefObject, useCallback } from 'react';

/**
 * Configuration for table virtualization
 */
export interface TableVirtualizationConfig {
  /** Total number of rows */
  readonly rowCount: number;
  /** Reference to scroll container element */
  readonly scrollElementRef: RefObject<HTMLDivElement | null>;
  /** Estimated height of each row */
  readonly estimatedRowHeight: number;
  /** Number of rows to render above/below viewport */
  readonly overscan: number;
  /** Whether virtualization is enabled */
  readonly enabled: boolean;
}

/**
 * Return value from useTableVirtualization hook
 */
export interface TableVirtualizationResult {
  /** TanStack Virtual virtualizer instance */
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** Virtual items currently in viewport */
  readonly virtualRows: VirtualItem[];
  /** Total height of all rows */
  readonly totalSize: number;
  /** Top padding for virtual scrolling */
  readonly paddingTop: number;
  /** Bottom padding for virtual scrolling */
  readonly paddingBottom: number;
}

/**
 * Custom hook for table virtualization using TanStack Virtual
 *
 * Handles setup and calculation for virtualized table rendering,
 * including padding calculations for smooth scrolling.
 *
 * @param config - Virtualization configuration
 * @returns Virtualizer instance and calculated values
 *
 * @example
 * const { virtualRows, paddingTop, paddingBottom } = useTableVirtualization({
 *   rowCount: data.length,
 *   scrollElementRef: containerRef,
 *   estimatedRowHeight: 44,
 *   overscan: 5,
 *   enabled: data.length >= 20,
 * });
 */
export function useTableVirtualization({
  rowCount,
  scrollElementRef,
  estimatedRowHeight,
  overscan,
  enabled,
}: TableVirtualizationConfig): TableVirtualizationResult {
  // Initialize virtualizer with stable estimateSize function
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: useCallback(() => estimatedRowHeight, [estimatedRowHeight]),
    overscan,
    enabled,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Calculate padding for virtual scrolling
  // Top padding: distance from container start to first virtual row
  const paddingTop =
    enabled && virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;

  // Bottom padding: distance from last virtual row to container end
  const paddingBottom =
    enabled && virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  return {
    virtualizer,
    virtualRows,
    totalSize,
    paddingTop,
    paddingBottom,
  };
}
