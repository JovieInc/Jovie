'use client';

import { useEffect } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Auto-opens the desktop companion while keeping the mobile editor available.
 * Crossing into mobile closes the companion before explicit modal disclosure.
 * Renders nothing — just triggers the side effect.
 */
export function ProfilePreviewOpener() {
  const { open, close } = usePreviewPanelState();
  const isDesktop = useBreakpoint('lg');

  useEffect(() => {
    if (isDesktop) open();
    else close();
  }, [isDesktop, open, close]);

  return null;
}
