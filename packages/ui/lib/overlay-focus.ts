'use client';

import * as React from 'react';

const MAX_MENU_DEPTH = 8;

/**
 * Resolve the element that should receive focus when a modal opened from a
 * menu item closes.
 *
 * A dialog opened from a dropdown item outlives the item: the menu unmounts,
 * so Radix's default close-focus target is detached and focus falls to
 * `<body>`. Radix menus are labelled by their trigger, so walk
 * item -> menu -> trigger (through nested submenus) to the root trigger.
 * Returns null when focus did not start inside a menu.
 */
export function resolveMenuOriginTrigger(
  start: Element | null
): HTMLElement | null {
  let node = start;
  for (let depth = 0; node && depth < MAX_MENU_DEPTH; depth += 1) {
    const menu = node.closest('[role="menu"]');
    if (!menu) {
      return node !== start && node instanceof HTMLElement ? node : null;
    }
    const labelledBy = menu.getAttribute('aria-labelledby');
    node = labelledBy ? document.getElementById(labelledBy) : null;
  }
  return null;
}

type RefTarget<T> = React.Ref<T> | undefined;

function assignRef<T>(ref: RefTarget<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as React.MutableRefObject<T | null>).current = value;
}

/**
 * Restores focus to the originating menu trigger when a modal that was
 * opened from a menu item closes.
 */
export function useMenuOriginFocusRestore<T extends HTMLElement>(
  forwardedRef: RefTarget<T>,
  onCloseAutoFocus?: (event: Event) => void
) {
  const originRef = React.useRef<HTMLElement | null>(null);

  const contentRef = React.useCallback(
    (node: T | null) => {
      if (node && typeof document !== 'undefined') {
        originRef.current = resolveMenuOriginTrigger(document.activeElement);
      }
      assignRef(forwardedRef, node);
    },
    [forwardedRef]
  );

  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event);
      const origin = originRef.current;
      originRef.current = null;
      if (event.defaultPrevented || !origin?.isConnected) return;
      event.preventDefault();
      origin.focus();
    },
    [onCloseAutoFocus]
  );

  return { contentRef, handleCloseAutoFocus };
}
