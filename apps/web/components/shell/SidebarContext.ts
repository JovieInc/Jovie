'use client';

import React from 'react';

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
