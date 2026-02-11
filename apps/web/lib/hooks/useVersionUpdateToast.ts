'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from './useVersionMonitor';

const TOAST_ID = 'version-update';
const DISMISSAL_KEY = 'jovie-version-update-dismissed';
const NOTIFICATION_DELAY_MS = 10_000;

/**
 * Hook that monitors for version updates and shows a Sonner toast
 * with a "Reload" action button.
 *
 * - Non-intrusive: shows after 10 second delay
 * - Persistent: stays until user dismisses or reloads
 * - Respects dismissal per session (sessionStorage)
 * - Deduplication via stable toast ID
 */
export function useVersionUpdateToast() {
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((version?: string) => {
    try {
      if (sessionStorage.getItem(DISMISSAL_KEY)) return;
    } catch {
      // sessionStorage not available
    }

    const title = version
      ? `New version available (v${version})`
      : 'New version available';

    toast.warning(title, {
      id: TOAST_ID,
      duration: Infinity,
      description:
        'An improved version of Jovie is available. Reload to update.',
      action: {
        label: 'Reload',
        onClick: () => globalThis.location.reload(),
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
    (info: VersionMismatchInfo) => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      notificationTimeoutRef.current = setTimeout(() => {
        showToast(info.newVersion);
      }, NOTIFICATION_DELAY_MS);
    },
    [showToast]
  );

  useVersionMonitor({ onVersionMismatch: handleVersionMismatch });

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);
}
