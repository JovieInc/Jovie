'use client';

import { usePathname } from 'next/navigation';
import React from 'react';
import { SHELL_RAIL_PREVIEW_INTENT_MS } from '@/components/shell/rail-motion';
import {
  SidebarContext,
  type SidebarContextValue,
} from '@/components/shell/SidebarContext';
import { useRailPreview } from '@/components/shell/useRailPreview';
import { useRailToggleFocusContinuity } from '@/components/shell/useRailToggleFocusContinuity';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { useSidebarCookieState } from '@/hooks/useSidebarCookieState';
import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  useSidebarKeyboardShortcut,
} from '@/hooks/useSidebarKeyboardShortcut';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';

export {
  SidebarContext,
  type SidebarContextValue,
  useSidebar,
} from '@/components/shell/SidebarContext';

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const pathname = usePathname();
    const isNarrowViewport = useBreakpointDown('lg');
    const isElectron = useIsElectronRuntime();
    // JOV-8942: a desktop window never adopts the mobile shell. The Electron
    // runtime keeps the inline rail mounted at compact widths instead of
    // swapping it for the mobile sheet + bottom tab bar.
    const isMobile = isNarrowViewport && !isElectron;
    const [openMobile, setOpenMobile] = React.useState(false);
    const { open, setOpen } = useSidebarCookieState({
      defaultOpen,
      open: openProp,
      onOpenChange: setOpenProp,
    });

    // Transient peek: hover (after intent dwell) or focus on the collapsed
    // rail floats the full menu over content. It never writes the pin bit.
    const { isPreview, isFloating, dismissPreview } = useRailPreview({
      side: 'left',
      pinned: open,
      enabled: !isMobile,
      resetKey: pathname,
      enterIntentMs: SHELL_RAIL_PREVIEW_INTENT_MS,
    });

    useRailToggleFocusContinuity('left', open);

    // A drawer dismissed by a desktop resize must not reappear on the next
    // resize into mobile or retain Radix's background interaction locks.
    React.useEffect(() => {
      if (!isMobile) setOpenMobile(false);
    }, [isMobile]);

    // JOV-8942: in the desktop runtime, entering the compact range collapses
    // the inline rail to the icon rail. Widening restores the pin the window
    // had before shrinking — unless the user changed the rail while compact,
    // which is their live intent and never overridden.
    const wasCompactDesktopRef = React.useRef(false);
    const restoreOpenRef = React.useRef(false);
    React.useEffect(() => {
      if (!isElectron) {
        wasCompactDesktopRef.current = false;
        restoreOpenRef.current = false;
        return;
      }
      if (!isNarrowViewport) {
        if (wasCompactDesktopRef.current) {
          wasCompactDesktopRef.current = false;
          if (restoreOpenRef.current) {
            restoreOpenRef.current = false;
            setOpen(true);
          }
        }
        return;
      }
      if (!wasCompactDesktopRef.current) {
        wasCompactDesktopRef.current = true;
        restoreOpenRef.current = open;
        if (open) setOpen(false);
        return;
      }
      // Already compact and collapsed by us: a rail the user (re)opened
      // while compact must not be forced back closed on widen.
      if (open) restoreOpenRef.current = false;
    }, [isElectron, isNarrowViewport, open, setOpen]);

    // Helper to toggle the sidebar.
    const toggleSidebar = React.useCallback(() => {
      dismissPreview();
      return isMobile ? setOpenMobile(open => !open) : setOpen(open => !open);
    }, [isMobile, setOpen, setOpenMobile, dismissPreview]);

    useSidebarKeyboardShortcut(toggleSidebar, SIDEBAR_KEYBOARD_SHORTCUT);

    // Peek reads as open for layout and labels, but only the pin (setOpen)
    // is persisted. The in-content toggle opts out of peek triggers so the
    // pointer never lands on a control the flyout is about to cover.
    const state = open || isPreview ? 'open' : 'closed';

    const contextValue = React.useMemo<SidebarContextValue>(
      () => ({
        state,
        open,
        isPreview,
        isFloating,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [
        state,
        open,
        isPreview,
        isFloating,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      ]
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <div
          style={
            {
              '--sidebar-width': 'var(--app-shell-sidebar-width)',
              '--sidebar-width-icon': '52px',
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            'group/sidebar-wrapper flex h-svh w-full overflow-x-hidden bg-base',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = 'SidebarProvider';
