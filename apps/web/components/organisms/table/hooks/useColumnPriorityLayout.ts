'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  COLUMN_PRIORITY_HYSTERESIS_PX,
  type ColumnPriorityLayout,
  type ColumnPrioritySpec,
  stabilizeColumnPriorityLayout,
} from '../column-priority';
import { useContainerWidth } from './useContainerWidth';

const WIDE_INITIAL_WIDTH = 1280;

export interface UseColumnPriorityLayoutOptions {
  /**
   * Width used before the container is measured. Defaults wide so the first
   * paint shows every column; a narrow first paint can stick in memoized rows.
   */
  readonly initialWidth?: number;
  readonly hysteresis?: number;
}

/**
 * Shared container-width column layout. One ResizeObserver, with hysteresis
 * so a tier does not appear and disappear while the width sits on its boundary.
 */
export function useColumnPriorityLayout(
  columns: readonly ColumnPrioritySpec[],
  node: HTMLElement | null,
  options?: UseColumnPriorityLayoutOptions
): ColumnPriorityLayout & { readonly width: number } {
  const initialWidth = options?.initialWidth ?? WIDE_INITIAL_WIDTH;
  const hysteresis = options?.hysteresis ?? COLUMN_PRIORITY_HYSTERESIS_PX;
  const width = useContainerWidth(node, initialWidth);
  const [previous, setPrevious] = useState<ColumnPriorityLayout | null>(null);
  const layout = useMemo(
    () => stabilizeColumnPriorityLayout(columns, width, previous, hysteresis),
    [columns, hysteresis, previous, width]
  );
  useEffect(() => {
    setPrevious(current => (current === layout ? current : layout));
  }, [layout]);

  return { ...layout, width };
}
