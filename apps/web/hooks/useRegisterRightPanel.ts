'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useSetRightPanel } from '@/contexts/RightPanelContext';

/**
 * Registers a ReactNode as the right panel in AuthShell.
 * Automatically cleans up (sets null) on unmount.
 */
export function useRegisterRightPanel(panel: ReactNode) {
  const setPanel = useSetRightPanel();

  // Update panel content on every change
  useEffect(() => {
    setPanel(panel);
  }, [panel, setPanel]);

  // Only clear on unmount — avoids flicker when panel dependencies change
  useEffect(() => {
    return () => setPanel(null);
  }, [setPanel]);
}
