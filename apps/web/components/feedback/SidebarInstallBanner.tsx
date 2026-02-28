'use client';

import { Download, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { TOAST_MESSAGES } from '@/lib/hooks/useNotifications';

/**
 * Inline PWA install banner rendered at the bottom of the sidebar.
 *
 * Non-iOS: shows "Install" button that triggers the browser install prompt.
 * iOS: shows instructional text (no programmatic install on iOS).
 * Dismiss persists for 7 days via usePWAInstall's localStorage logic.
 *
 * Hidden when the sidebar is collapsed to icon-only mode.
 */
export function SidebarInstallBanner() {
  const { canPrompt, isIOS, install, dismiss } = usePWAInstall();

  if (!canPrompt) return null;

  return (
    <div className='group-data-[collapsible=icon]:hidden px-2 pb-1'>
      <div className='relative rounded-md border border-sidebar-border bg-sidebar-accent p-2.5'>
        <button
          type='button'
          aria-label='Dismiss install banner'
          onClick={dismiss}
          className='absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded text-sidebar-muted transition-colors duration-normal hover:text-sidebar-item-foreground'
        >
          <X className='size-3' />
        </button>

        <div className='flex items-start gap-2 pr-4'>
          <Download className='mt-0.5 size-3.5 shrink-0 text-sidebar-item-foreground' />
          <div className='min-w-0'>
            <p className='text-app font-medium text-sidebar-item-foreground'>
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
                className='mt-1.5 inline-flex h-6 items-center rounded px-2 text-2xs font-medium text-sidebar-item-foreground bg-surface-3 transition-colors duration-normal hover:bg-interactive-hover'
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
