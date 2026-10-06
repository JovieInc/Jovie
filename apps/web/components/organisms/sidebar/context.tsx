'use client';

import { usePathname } from 'next/navigation';
import React from 'react';
import { useRailPreview } from '@/components/shell/useRailPreview';
import { useRailToggleFocusContinuity } from '@/components/shell/useRailToggleFocusContinuity';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { useSidebarCookieState } from '@/hooks/useSidebarCookieState';
import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  useSidebarKeyboardShortcut,
} from '@/hooks/useSidebarKeyboardShortcut';
import { cn } from '@/lib/utils';

export type SidebarContextValue = {
  state: 'open' | 'closed';
  open: boolean;
  isPreview: boolean;
  isFloating: boolean;
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

export const SidebarContext = React.createContext<SidebarContextValue | null>(
  null
);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new TypeError('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}

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

    const { isPreview, isFloating, dismissPreview } = useRailPreview({
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
      dismissPreview();
      return isMobile ? setOpenMobile(open => !open) : setOpen(open => !open);
    }, [isMobile, setOpen, setOpenMobile, dismissPreview]);

    useSidebarKeyboardShortcut(toggleSidebar, SIDEBAR_KEYBOARD_SHORTCUT);

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
