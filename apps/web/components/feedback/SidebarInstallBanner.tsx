'use client';

import { Download, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { env } from '@/lib/env-client';
import { TOAST_MESSAGES } from '@/lib/hooks/useNotifications';
import {
  useVersionMonitor,
  type VersionMismatchInfo,
} from '@/lib/hooks/useVersionMonitor';

const DISMISSAL_KEY = 'jovie-version-update-dismissed';
const NOTIFICATION_DELAY_MS = 10_000;

/**
 * Unified sidebar banner that handles both version update and PWA install prompts.
 *
 * Priority: version update reload prompt takes precedence over PWA install.
 * After reload (on latest version), shows PWA install banner if applicable.
 * Dismiss persists per session (version update) or 7 days (PWA install).
 *
 * Hidden when the sidebar is collapsed to icon-only mode.
 */
export function SidebarInstallBanner() {
  const isPassiveRuntime = env.IS_TEST || env.IS_E2E;

  const { canPrompt, isIOS, install, dismiss: dismissPwa } = usePWAInstall();

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

  // Priority: version update > PWA install
  // Never show both simultaneously
  if (showVersionBanner && versionUpdate) {
    const title = versionUpdate.newVersion
      ? `New version available (v${versionUpdate.newVersion})`
      : 'New version available';

    return (
      <div className='group-data-[collapsible=icon]:hidden px-2 pb-1'>
        <div className='relative rounded-[10px] border border-sidebar-border/70 bg-sidebar-accent/35 p-2 shadow-none'>
          <button
            type='button'
            aria-label='Dismiss version update banner'
            onClick={dismissVersionUpdate}
            className='absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-sidebar-muted transition-colors duration-normal hover:text-sidebar-item-foreground'
          >
            <X className='size-3' />
          </button>

          <div className='flex items-start gap-2 pr-4'>
            <RefreshCw className='mt-0.5 size-3.5 shrink-0 text-sidebar-item-icon' />
            <div className='min-w-0'>
              <p className='text-[12px] font-medium tracking-[-0.01em] text-sidebar-item-foreground'>
                {title}
              </p>
              <p className='mt-0.5 text-2xs leading-snug text-sidebar-muted'>
                An improved version of Jovie is available. Reload to update.
              </p>
              <button
                type='button'
                onClick={reload}
                className='mt-1.5 inline-flex h-6 items-center rounded-[7px] border border-sidebar-border/60 px-2 text-2xs font-medium text-sidebar-item-foreground transition-colors duration-normal hover:bg-sidebar-accent-active'
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fall back to PWA install banner
  if (!canPrompt) return null;

  return (
    <div className='group-data-[collapsible=icon]:hidden px-2 pb-1'>
      <div className='relative rounded-[10px] border border-sidebar-border/70 bg-sidebar-accent/35 p-2 shadow-none'>
        <button
          type='button'
          aria-label='Dismiss install banner'
          onClick={dismissPwa}
          className='absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-sidebar-muted transition-colors duration-normal hover:text-sidebar-item-foreground'
        >
          <X className='size-3' />
        </button>

        <div className='flex items-start gap-2 pr-4'>
          <Download className='mt-0.5 size-3.5 shrink-0 text-sidebar-item-icon' />
          <div className='min-w-0'>
            <p className='text-[12px] font-medium tracking-[-0.01em] text-sidebar-item-foreground'>
              {TOAST_MESSAGES.PWA_INSTALL}
            </p>
            <p className='mt-0.5 text-2xs leading-snug text-sidebar-muted'>
              {isIOS
                ? TOAST_MESSAGES.PWA_INSTALL_IOS
                : TOAST_MESSAGES.PWA_INSTALL_DESCRIPTION}
            </p>
            {!isIOS && (
              <button
                type='button'
                onClick={install}
                className='mt-1.5 inline-flex h-6 items-center rounded-[7px] border border-sidebar-border/60 px-2 text-2xs font-medium text-sidebar-item-foreground transition-colors duration-normal hover:bg-sidebar-accent-active'
              >
                Install
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
