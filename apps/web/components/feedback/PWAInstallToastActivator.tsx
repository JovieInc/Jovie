'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePWAInstall } from '@/hooks/usePWAInstall';

const TOAST_ID = 'pwa-install';

/**
 * Activates PWA install prompt as a Sonner toast.
 *
 * Non-iOS: shows "Install" action button that triggers the browser prompt.
 * iOS: shows instructional description (no programmatic install on iOS).
 * Dismiss persists for 7 days via usePWAInstall's localStorage logic.
 *
 * Rendered inside the authenticated app shell — never on public pages.
 */
export function PWAInstallToastActivator() {
  const { canPrompt, isIOS, install, dismiss } = usePWAInstall();
  const hasShown = useRef(false);

  useEffect(() => {
    if (!canPrompt || hasShown.current) return;
    hasShown.current = true;

    const description = isIOS
      ? 'Tap the Share button, then "Add to Home Screen" to install.'
      : 'Add Jovie to your dock for quick access.';

    toast.info('Install Jovie', {
      id: TOAST_ID,
      duration: Infinity,
      description,
      ...(isIOS
        ? {}
        : {
            action: {
              label: 'Install',
              onClick: () => install(),
            },
          }),
      onDismiss: () => dismiss(),
    });
  }, [canPrompt, isIOS, install, dismiss]);

  // When canPrompt becomes false (app installed or dismissed via hook), dismiss the toast
  useEffect(() => {
    if (!canPrompt && hasShown.current) {
      toast.dismiss(TOAST_ID);
    }
  }, [canPrompt]);

  return null;
}
