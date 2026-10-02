'use client';

import { useEffect, useState } from 'react';

/**
 * Container width via one ResizeObserver. Non-positive measurements are
 * ignored so the first paint can stay on the wide column set until layout
 * has actually been measured.
 */
export function useContainerWidth(
  node: HTMLElement | null,
  initialWidth: number
): number {
  const [width, setWidth] = useState(initialWidth);

  useEffect(() => {
    if (!node) return;

    const commit = (measured: number) => {
      if (!Number.isFinite(measured) || measured <= 0) return;
      setWidth(current => (current === measured ? current : measured));
    };

    commit(node.getBoundingClientRect().width);

    if (typeof ResizeObserver !== 'function') {
      const onResize = () => commit(node.getBoundingClientRect().width);
      globalThis.addEventListener('resize', onResize);
      return () => globalThis.removeEventListener('resize', onResize);
    }

    const observer = new ResizeObserver(entries => {
      commit(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return width;
}
