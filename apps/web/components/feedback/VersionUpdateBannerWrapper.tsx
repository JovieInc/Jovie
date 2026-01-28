'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from '@/lib/hooks/useVersionMonitor';
import { VersionUpdateBanner } from './VersionUpdateBanner';

const DISMISSAL_KEY = 'jovie-version-update-dismissed';
const NOTIFICATION_DELAY_MS = 10_000; // 10 seconds delay before showing

/**
 * Wrapper component that connects VersionUpdateBanner to the version monitor.
 *
 * Features:
 * - Non-intrusive: Shows after 10 second delay
 * - Persistent: Banner stays until user dismisses or refreshes
 * - Respects user choice: Won't re-show after dismissal (per session)
 */
export function VersionUpdateBannerWrapper() {
  const [showBanner, setShowBanner] = useState(false);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVersionMismatch = useCallback((_info: VersionMismatchInfo) => {
    // Check if user previously dismissed this session
    try {
      if (sessionStorage.getItem(DISMISSAL_KEY)) {
        return;
      }
    } catch {
      // sessionStorage not available (SSR or private browsing)
    }

    // Clear any pending timeout
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    // Delay notification to avoid jarring immediate display
    notificationTimeoutRef.current = setTimeout(() => {
      setShowBanner(true);
    }, NOTIFICATION_DELAY_MS);
  }, []);

  useVersionMonitor({
    onVersionMismatch: handleVersionMismatch,
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    try {
      sessionStorage.setItem(DISMISSAL_KEY, 'true');
    } catch {
      // sessionStorage not available
    }
  }, []);

  if (!showBanner) {
    return null;
  }

  return (
    <VersionUpdateBanner onReload={handleReload} onDismiss={handleDismiss} />
  );
}
