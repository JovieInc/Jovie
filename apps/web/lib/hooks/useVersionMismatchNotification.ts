'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from './useVersionMonitor';

const TOAST_ID = 'version-mismatch';
const DISMISSAL_KEY = 'jovie-version-mismatch-dismissed';
const NOTIFICATION_DELAY_MS = 10_000; // 10 seconds delay before showing

/**
 * Hook that monitors for version mismatches and shows a user-friendly
 * toast notification with a "Refresh Now" action.
 *
 * Features:
 * - Non-intrusive: Shows after 10 second delay
 * - Persistent: Toast stays until user dismisses or refreshes
 * - Respects user choice: Won't re-show after dismissal (per session)
 * - Deduplication: Uses stable toast ID to prevent duplicates
 */
export function useVersionMismatchNotification() {
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showNotification = useCallback(() => {
    // Check if user previously dismissed this session
    try {
      if (sessionStorage.getItem(DISMISSAL_KEY)) {
        return;
      }
    } catch {
      // sessionStorage not available (SSR or private browsing)
    }

    toast.info('A new version is available', {
      id: TOAST_ID,
      duration: Infinity,
      description: 'Refresh to get the latest features and fixes.',
      action: {
        label: 'Refresh Now',
        onClick: () => {
          globalThis.location.reload();
        },
      },
      onDismiss: () => {
        try {
          sessionStorage.setItem(DISMISSAL_KEY, 'true');
        } catch {
          // sessionStorage not available
        }
      },
    });
  }, []);

  const handleVersionMismatch = useCallback(
    (_info: VersionMismatchInfo) => {
      // Clear any pending timeout
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }

      // Delay notification to avoid jarring immediate display
      notificationTimeoutRef.current = setTimeout(() => {
        showNotification();
      }, NOTIFICATION_DELAY_MS);
    },
    [showNotification]
  );

  const { hasMismatch, mismatchInfo, checkNow } = useVersionMonitor({
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

  return { hasMismatch, mismatchInfo, checkNow };
}
