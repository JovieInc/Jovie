import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { type RefObject, useCallback } from 'react';

export interface UseTableVirtualizationOptions {
  /** Number of rows in the table */
  rowCount: number;
  /** Ref to the scroll container element */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Estimated height of each row in pixels */
  rowHeight?: number;
  /** Number of rows to render above/below viewport */
  overscan?: number;
  /** Whether virtualization should be enabled */
  enabled?: boolean;
}

export interface UseTableVirtualizationReturn {
  /** Virtual rows to render */
  virtualRows: VirtualItem[];
  /** Total height of all rows */
  totalSize: number;
  /** Top padding for virtual positioning */
  paddingTop: number;
  /** Bottom padding for virtual positioning */
  paddingBottom: number;
  /** Whether virtualization is active */
  isVirtualized: boolean;
  /** Function to measure a row element for dynamic sizing */
  measureElement: (el: HTMLElement | null) => void;
}

/**
 * Hook for managing table virtualization with TanStack Virtual.
 *
 * Handles:
 * - Virtualizer initialization with proper configuration
 * - Padding calculation for virtual scroll containers
 * - Conditional virtualization based on row count
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const {
 *   virtualRows,
 *   paddingTop,
 *   paddingBottom,
 *   isVirtualized,
 *   measureElement
 * } = useTableVirtualization({
 *   rowCount: data.length,
 *   containerRef,
 *   rowHeight: 44,
 *   overscan: 5,
 *   enabled: data.length >= 20,
 * });
 * ```
 */
export function useTableVirtualization({
  rowCount,
  containerRef,
  rowHeight = 44,
  overscan = 5,
  enabled = true,
}: UseTableVirtualizationOptions): UseTableVirtualizationReturn {
  const estimateSize = useCallback(() => rowHeight, [rowHeight]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize,
    overscan,
    enabled,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Calculate padding for virtualized rows
  const paddingTop =
    enabled && virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;

  const paddingBottom =
    enabled && virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  return {
    virtualRows,
    totalSize,
    paddingTop,
    paddingBottom,
    isVirtualized: enabled,
    measureElement: virtualizer.measureElement,
  };
}
