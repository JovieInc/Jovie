'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * Report how many `[data-fit-item]` children do not fully fit inside the
 * container, and hide them, so the caller can say "+N more" instead of
 * scrolling (Tim 2026-10-21: Home never scrolls).
 *
 * The container must be `relative` (it is the items' offset parent), clip
 * (`overflow-hidden`) and have a bounded height. Hidden items keep their
 * box (`visibility: hidden`), so hiding never moves or resizes anything and
 * the resize observer cannot loop. The "+N more" line belongs outside the
 * container. With `enabled: false` nothing is hidden.
 */
export function useFitList<T extends HTMLElement>(
  itemKey: string,
  enabled = true
): {
  readonly ref: RefObject<T | null>;
  readonly hidden: number;
} {
  const ref = useRef<T | null>(null);
  const [hidden, setHidden] = useState(0);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const items = () =>
      Array.from(box.querySelectorAll<HTMLElement>(':scope > [data-fit-item]'));
    const fit = () => {
      let count = 0;
      for (const item of items()) {
        const overflows =
          enabled && item.offsetTop + item.offsetHeight > box.clientHeight + 1;
        item.style.visibility = overflows ? 'hidden' : '';
        if (overflows) {
          item.setAttribute('aria-hidden', 'true');
          count += 1;
        } else {
          item.removeAttribute('aria-hidden');
        }
      }
      setHidden(previous => (previous === count ? previous : count));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    // Items are observed too: an opened disclosure grows its card without
    // resizing the container and must push later items into "+N more".
    const observer = new ResizeObserver(() => fit());
    observer.observe(box);
    for (const item of items()) observer.observe(item);
    return () => observer.disconnect();
  }, [itemKey, enabled]);

  return { ref, hidden };
}
