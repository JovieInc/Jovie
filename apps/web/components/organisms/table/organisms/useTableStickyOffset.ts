'use client';

import { useLayoutEffect, useState } from 'react';

/** Measure the actual sticky column header (or hidden-header sort status). */
export function useTableStickyOffset(
  root: HTMLElement | null,
  headerHidden: boolean,
  contentVersion: unknown,
  sortVersion: unknown
): number {
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    if (!root) return;
    const header = root.querySelector(
      headerHidden ? '[data-table-sticky-status]' : ':scope > table > thead'
    );
    const measure = () =>
      setOffset(header?.getBoundingClientRect().height ?? 0);
    measure();
    if (!header || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [root, headerHidden, contentVersion, sortVersion]);
  return offset;
}
