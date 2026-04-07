'use client';

import { createContext, useContext } from 'react';

/**
 * Context for scoping profile drawers to a container element on desktop.
 * When provided, drawers use absolute positioning within the container
 * instead of fixed positioning on the viewport.
 */
const DrawerContainerContext = createContext<HTMLElement | null>(null);

export const DrawerContainerProvider = DrawerContainerContext.Provider;

export function useDrawerContainer(): HTMLElement | null {
  return useContext(DrawerContainerContext);
}
