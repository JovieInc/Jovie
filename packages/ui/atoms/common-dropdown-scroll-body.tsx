'use client';

import * as React from 'react';

import { MENU_SCROLL_BODY_CONTENT } from '../lib/dropdown-styles';
import type { CommonDropdownScrollBody } from './common-dropdown-types';
import { getContentStyle } from './common-dropdown-utils';

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

/** Default list-panel width for a scroll-body menu. */
export const MENU_SCROLL_BODY_WIDTH = '25rem';

/**
 * A scroll-body menu is a fixed-width list: long rows truncate instead of
 * widening the panel, and it never grows past the viewport gutter.
 */
export function getScrollBodyWidth(
  width: number | string = MENU_SCROLL_BODY_WIDTH
): string {
  const requested = typeof width === 'number' ? `${width}px` : width;
  return `min(${requested}, calc(100vw - var(--space-8, 2rem)))`;
}

/**
 * Type to filter: a printable key (or Backspace) pressed on a row goes to
 * the search field instead of Radix typeahead, so the list keeps filtering
 * wherever focus sits. Arrow keys, Enter and Escape keep their menu behavior.
 */
export function redirectTypingToSearch(
  event: React.KeyboardEvent<HTMLDivElement>,
  input: HTMLInputElement | null,
  query: string,
  setQuery: (query: string) => void
) {
  if (!input || event.target === input) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // React bubbles keys out of portaled submenus and custom fields; only
  // this menu's own rows hand typing to the search (Radix's own check).
  const target = event.target as HTMLElement;
  if (target.closest('[data-radix-menu-content]') !== event.currentTarget)
    return;
  if (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"]')
  )
    return;
  const isPrintable = event.key.length === 1 && event.key !== ' ';
  if (!isPrintable && event.key !== 'Backspace') return;
  event.preventDefault();
  setQuery(event.key === 'Backspace' ? query.slice(0, -1) : query + event.key);
  input.focus();
}

/**
 * Pass as CommonDropdown's `scrollBody`: pinned search, scrolling rows with
 * edge fades, a fixed width and type to filter.
 */
export const MENU_SCROLL_BODY: CommonDropdownScrollBody = {
  Body: MenuScrollBody,
  contentClassName: MENU_SCROLL_BODY_CONTENT,
  getContentStyle: (minWidth, maxHeight) => ({
    ...getContentStyle(undefined, maxHeight, 'dropdown'),
    overflowY: 'hidden',
    width: getScrollBodyWidth(minWidth),
  }),
  redirectTyping: redirectTypingToSearch,
};
