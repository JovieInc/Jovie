'use client';

import React from 'react';

const SIDEBAR_COOKIE_NAME = 'sidebar:state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

type UseSidebarCookieStateParams = {
  defaultOpen: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function readSidebarCookie(defaultOpen: boolean) {
  if (typeof document === 'undefined') {
    return defaultOpen;
  }

  const cookie = document.cookie
    .split(';')
    .map(entry => entry.trim())
    .find(entry => entry.startsWith(`${SIDEBAR_COOKIE_NAME}=`));

  if (!cookie) return defaultOpen;

  const value = cookie.split('=')[1];
  if (value === 'true') return true;
  if (value === 'false') return false;

  return defaultOpen;
}

function persistSidebarCookie(nextOpen: boolean) {
  if (typeof document === 'undefined') return;

  document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}

export function useSidebarCookieState({
  defaultOpen,
  open: openProp,
  onOpenChange,
}: UseSidebarCookieStateParams) {
  const [openInternal, setOpenInternal] = React.useState(() =>
    readSidebarCookie(defaultOpen)
  );

  const open = openProp ?? openInternal;
  const openRef = React.useRef(open);

  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const nextOpen =
        typeof value === 'function' ? value(openRef.current) : value;

      persistSidebarCookie(nextOpen);

      if (onOpenChange) {
        onOpenChange(nextOpen);
      } else {
        setOpenInternal(nextOpen);
      }
    },
    [onOpenChange]
  );

  return { open, setOpen } as const;
}

export { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME };
