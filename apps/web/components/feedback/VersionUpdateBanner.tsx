'use client';

import { X } from 'lucide-react';

interface VersionUpdateBannerProps {
  readonly onReload: () => void;
  readonly onDismiss: () => void;
}

/**
 * Version update banner component - Linear-style design.
 *
 * Displays a floating notification when a new version of Jovie is available,
 * prompting the user to reload the window.
 */
export function VersionUpdateBanner({
  onReload,
  onDismiss,
}: VersionUpdateBannerProps) {
  return (
    <div className='fixed bottom-4 right-4 z-[9999] max-w-sm'>
      <div className='rounded-xl border border-default bg-surface-3 p-4 shadow-lg'>
        <div className='flex items-start gap-3'>
          {/* Yellow warning icon */}
          <div className='flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-warning'>
            <span className='text-sm font-bold text-warning-foreground'>!</span>
          </div>

          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold text-primary-token'>
              New version available
            </p>
            <p className='mt-1 text-sm text-secondary-token'>
              An improved version of Jovie is available. Please reload this
              window now to update.
            </p>
            <button
              type='button'
              onClick={onReload}
              className='mt-2 text-sm text-accent hover:underline'
            >
              Reload
            </button>
          </div>

          {/* Close button */}
          <button
            type='button'
            onClick={onDismiss}
            className='flex-shrink-0 rounded p-1 text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
            aria-label='Dismiss'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      </div>
    </div>
  );
}
