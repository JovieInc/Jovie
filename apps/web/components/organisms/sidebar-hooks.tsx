'use client';

import React from 'react';

export const SIDEBAR_COOKIE_NAME = 'sidebar:state';
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type SidebarCookieStateParams = {
  defaultOpen: boolean;
  openProp?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function parseSidebarCookie(defaultOpen: boolean) {
  if (typeof document === 'undefined') return defaultOpen;

  const cookieValue = document.cookie
    .split('; ')
    .find(entry => entry.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
    ?.split('=')[1];

  if (cookieValue === undefined) return defaultOpen;

  return cookieValue === 'true';
}

export function useSidebarCookieState({
  defaultOpen,
  openProp,
  onOpenChange,
}: SidebarCookieStateParams) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const openRef = React.useRef(openProp ?? defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  React.useEffect(() => {
    if (openProp !== undefined) return;

    const persistedOpen = parseSidebarCookie(defaultOpen);
    setUncontrolledOpen(persistedOpen);
  }, [defaultOpen, openProp]);

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState =
        typeof value === 'function' ? value(openRef.current) : value;

      if (onOpenChange) {
        onOpenChange(openState);
      } else {
        setUncontrolledOpen(openState);
      }

      if (typeof document !== 'undefined') {
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      }
    },
    [onOpenChange]
  );

  return { open, setOpen } as const;
}

export function useSidebarKeyboardShortcut(
  toggleSidebar: () => void,
  shortcut: string = SIDEBAR_KEYBOARD_SHORTCUT
) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === shortcut && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcut, toggleSidebar]);
}
