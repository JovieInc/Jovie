'use client';

import { useEffect } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';

/**
 * Auto-opens the preview panel when the profile page mounts.
 * Renders nothing — just triggers the side effect.
 */
export function ProfilePreviewOpener() {
  const { open } = usePreviewPanelState();

  useEffect(() => {
    open();
  }, [open]);

  return null;
}
