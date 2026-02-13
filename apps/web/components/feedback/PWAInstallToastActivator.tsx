'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { isProfileRoute } from '@/lib/sentry/route-detector';

const TOAST_ID = 'pwa-install';

/**
 * Activates PWA install prompt as a Sonner toast.
 *
 * Non-iOS: shows "Install" action button that triggers the browser prompt.
 * iOS: shows instructional description (no programmatic install on iOS).
 * Dismiss persists for 7 days via usePWAInstall's localStorage logic.
 */
export function PWAInstallToastActivator() {
  const { canPrompt, isIOS, install, dismiss } = usePWAInstall();
  const hasShown = useRef(false);
  const pathname = usePathname() ?? '';
  const onProfilePage = isProfileRoute(pathname);

  useEffect(() => {
    if (!canPrompt || hasShown.current || onProfilePage) return;
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
  }, [canPrompt, isIOS, install, dismiss, onProfilePage]);

  // When canPrompt becomes false (app installed or dismissed via hook), dismiss the toast
  useEffect(() => {
    if (!canPrompt && hasShown.current) {
      toast.dismiss(TOAST_ID);
    }
  }, [canPrompt]);

  return null;
}
