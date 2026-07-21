'use client';

import { RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersionUpdateTitle } from '@/components/shell/getVersionUpdateTitle';
import { env } from '@/lib/env-client';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from '@/lib/hooks/useVersionMonitor';

const DISMISSAL_KEY = 'jovie-version-update-dismissed';
const NOTIFICATION_DELAY_MS = 10_000;

/**
 * Sidebar banner that prompts the user to reload when a new app version ships.
 *
 * Hidden when the sidebar is collapsed to icon-only mode.
 */
export function SidebarInstallBanner() {
  const isPassiveRuntime = env.IS_TEST || env.IS_E2E;

  const [versionUpdate, setVersionUpdate] =
    useState<VersionMismatchInfo | null>(null);
  const [showVersionBanner, setShowVersionBanner] = useState(false);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVersionMismatch = useCallback((info: VersionMismatchInfo) => {
    // Don't show if already dismissed this session
    try {
      if (sessionStorage.getItem(DISMISSAL_KEY)) return;
    } catch {
      // sessionStorage not available
    }

    setVersionUpdate(info);
    // Show after a delay to be non-intrusive
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    notificationTimeoutRef.current = setTimeout(() => {
      setShowVersionBanner(true);
    }, NOTIFICATION_DELAY_MS);
  }, []);

  useVersionMonitor({
    onVersionMismatch: handleVersionMismatch,
    enabled: !isPassiveRuntime,
  });

  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  const dismissVersionUpdate = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISSAL_KEY, 'true');
    } catch {
      // sessionStorage not available
    }
    setShowVersionBanner(false);
    setVersionUpdate(null);
  }, []);

  const reload = useCallback(() => {
    globalThis.location.reload();
  }, []);

  if (isPassiveRuntime) {
    return null;
  }

  if (!showVersionBanner || !versionUpdate) {
    return null;
  }

  const title = getVersionUpdateTitle(versionUpdate.newVersion, {
    titleCase: false,
  });

  return (
    <div className='group-data-[collapsible=icon]:hidden px-2.5 pb-1.5'>
      <div className='relative rounded-xl border border-sidebar-border/70 bg-sidebar-accent/12 px-2.5 py-2 text-sidebar-muted'>
        <button
          type='button'
          aria-label='Dismiss Version Update Banner'
          onClick={dismissVersionUpdate}
          className='absolute top-1 right-1 flex size-6 items-center justify-center rounded text-sidebar-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring'
        >
          <X className='size-3' />
        </button>

        <div className='flex items-start gap-1.5 pr-7'>
          <RefreshCw className='mt-0.5 size-3 shrink-0 text-sidebar-item-icon/60' />
          <div className='min-w-0'>
            <p className='text-2xs font-medium tracking-tight text-sidebar-item-foreground/75'>
              {title}
            </p>
            <p className='mt-0.5 text-3xs leading-[1.35] text-sidebar-muted/80'>
              An improved version of Jovie is available. Reload to update.
            </p>
            <button
              type='button'
              onClick={reload}
              className='mt-1 inline-flex min-h-6 items-center rounded-full bg-transparent px-1.5 text-3xs font-medium text-sidebar-item-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring'
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
