'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useSetTablePanel } from '@/contexts/TablePanelContext';

/**
 * Registers a ReactNode as the right panel in AuthShell for table routes.
 * Automatically cleans up (sets null) on unmount.
 */
export function useRegisterTablePanel(panel: ReactNode) {
  const setPanel = useSetTablePanel();

  // Update panel content on every change
  useEffect(() => {
    setPanel(panel);
  }, [panel, setPanel]);

  // Only clear on unmount — avoids flicker when panel dependencies change
  useEffect(() => {
    return () => setPanel(null);
  }, [setPanel]);
}
