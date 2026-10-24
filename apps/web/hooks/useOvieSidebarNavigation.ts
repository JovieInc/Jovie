'use client';

// @coverage-via apps/web/tests/unit/components/organisms/UnifiedSidebar.library.test.tsx

import { useEffect, useRef } from 'react';
import { useSidebar } from '@/components/shell/SidebarContext';
import { APP_ROUTES } from '@/constants/routes';
import { OVIE_NAVIGATION_KEY } from '@/lib/keyboard-shortcuts';
import { isShellShortcutSuppressed } from '@/lib/utils/keyboard';

/** Mounted once above Sidebar's desktop/mobile copies. */
export function useOvieSidebarNavigation(enabled: boolean) {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const focusFrame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    },
    []
  );

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.metaKey || event.ctrlKey)
        return;
      // Option changes event.key on macOS; prefer the physical key.
      if (
        event.code !== `Key${OVIE_NAVIGATION_KEY.toUpperCase()}` &&
        event.key.toLowerCase() !== OVIE_NAVIGATION_KEY
      )
        return;
      const rail = document.getElementById('shell-left-rail');
      if (isShellShortcutSuppressed(event, isMobile ? rail : null)) return;
      event.preventDefault();
      if (isMobile) setOpenMobile(true);
      else setOpen(true);
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      // Wait for the drawer/rail to mount, then target the active copy only.
      focusFrame.current = requestAnimationFrame(() => {
        const activeRail = document.getElementById('shell-left-rail');
        const scroller = activeRail?.querySelector<HTMLElement>(
          '[data-ov-navigation-scroll]'
        );
        if (scroller) scroller.scrollTop = 0;
        activeRail
          ?.querySelector<HTMLAnchorElement>(`a[href="${APP_ROUTES.OV}"]`)
          ?.focus({ preventScroll: true });
        focusFrame.current = null;
      });
    };
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isMobile, setOpen, setOpenMobile]);
}
