'use client';

import { usePathname } from 'next/navigation';
import React from 'react';
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
    const isMobile = useBreakpointDown('lg');
    const [openMobile, setOpenMobile] = React.useState(false);
    const { open, setOpen } = useSidebarCookieState({
      defaultOpen,
      open: openProp,
      onOpenChange: setOpenProp,
    });

    const {
      isPreview,
      isFloating,
      dismissPreview,
      openPreview,
      togglePreview,
    } = useRailPreview({
      side: 'left',
      pinned: open,
      enabled: !isMobile,
      resetKey: pathname,
    });

    useRailToggleFocusContinuity('left', open);

    // A drawer dismissed by a desktop resize must not reappear on the next
    // resize into mobile or retain Radix's background interaction locks.
    React.useEffect(() => {
      if (!isMobile) setOpenMobile(false);
    }, [isMobile]);

    // Helper to toggle the sidebar.
    const toggleSidebar = React.useCallback(() => {
      if (isMobile) return setOpenMobile(value => !value);
      if (open) {
        dismissPreview();
        setOpen(false);
      } else {
        togglePreview();
      }
    }, [isMobile, open, setOpen, dismissPreview, togglePreview]);

    const closeSidebar = React.useCallback(() => {
      dismissPreview();
      setOpenMobile(false);
    }, [dismissPreview]);
    const pinSidebar = React.useCallback(() => setOpen(true), [setOpen]);
    const unpinSidebar = React.useCallback(() => {
      dismissPreview();
      setOpen(false);
    }, [dismissPreview, setOpen]);
    const presentation = isMobile
      ? 'drawer'
      : open
        ? 'pinned'
        : isPreview
          ? 'floating'
          : 'collapsed';

    useSidebarKeyboardShortcut(toggleSidebar, SIDEBAR_KEYBOARD_SHORTCUT);

    const state = open || isPreview ? 'open' : 'closed';

    const contextValue = React.useMemo<SidebarContextValue>(
      () => ({
        state,
        open,
        isPreview,
        isFloating,
        presentation,
        previewSidebar: openPreview,
        closeSidebar,
        pinSidebar,
        unpinSidebar,
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
        presentation,
        openPreview,
        closeSidebar,
        pinSidebar,
        unpinSidebar,
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
