'use client';

import { useCallback } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { useTableMeta } from '@/contexts/TableMetaContext';
import { useRightRailKeyboardShortcut } from '@/hooks/useRightRailKeyboardShortcut';

/**
 * Shell-level `]` handler. Prefers the active table drawer toggle when a route
 * registers one; otherwise falls back to the preview right rail.
 */
export function RightRailKeyboardHandler() {
  const { toggle: togglePreviewPanel } = usePreviewPanelState();
  const { tableMeta } = useTableMeta();

  const handleToggle = useCallback(() => {
    if (tableMeta.toggle) {
      tableMeta.toggle();
      return;
    }

    togglePreviewPanel();
  }, [tableMeta, togglePreviewPanel]);

  useRightRailKeyboardShortcut(handleToggle);

  return null;
}
