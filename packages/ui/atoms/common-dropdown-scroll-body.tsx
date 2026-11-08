'use client';

import * as React from 'react';

/** Height of the list's edge fade; focused rows scroll clear of it. */
export const MENU_SCROLL_FADE_SIZE = '1.5rem';

export interface MenuScrollEdges {
  readonly top: boolean;
  readonly bottom: boolean;
}

/** Which edges still have rows clipped behind them. 1px slack for subpixel layout. */
export function getMenuScrollEdges(
  element: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>
): MenuScrollEdges {
  const { scrollTop, scrollHeight, clientHeight } = element;
  return {
    top: scrollTop > 1,
    bottom: scrollTop + clientHeight < scrollHeight - 1,
  };
}

/** Mask that fades only the clipped edges; undefined when nothing is clipped. */
export function getMenuScrollMask(edges: MenuScrollEdges): string | undefined {
  if (!edges.top && !edges.bottom) return undefined;
  const top = edges.top ? MENU_SCROLL_FADE_SIZE : '0px';
  const bottom = edges.bottom ? MENU_SCROLL_FADE_SIZE : '0px';
  return `linear-gradient(to bottom, transparent, black ${top}, black calc(100% - ${bottom}), transparent)`;
}

/**
 * Scroll region for `scrollBody` menus: the search header stays pinned above
 * it and only the rows scroll. Edge state lives in data attributes so tests
 * and visual checks can read it without measuring pixels.
 */
export function MenuScrollBody({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState<MenuScrollEdges>({
    top: false,
    bottom: false,
  });

  const measure = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const next = getMenuScrollEdges(node);
    setEdges(current =>
      current.top === next.top && current.bottom === next.bottom
        ? current
        : next
    );
  }, []);

  // Re-measure when rows change (filtering) or the surface resizes.
  React.useLayoutEffect(() => {
    measure();
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, children]);

  const mask = getMenuScrollMask(edges);

  return (
    <div
      ref={ref}
      data-slot='common-dropdown-scroll-body'
      data-fade-top={edges.top ? 'true' : undefined}
      data-fade-bottom={edges.bottom ? 'true' : undefined}
      onScroll={measure}
      className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-1'
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        scrollPaddingBlock: MENU_SCROLL_FADE_SIZE,
      }}
    >
      {children}
    </div>
  );
}
