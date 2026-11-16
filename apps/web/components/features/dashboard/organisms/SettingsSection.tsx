'use client';

import type * as React from 'react';
import { NavigationDestinationReady } from '@/components/features/dashboard/NavigationDestinationReady';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';

export interface SettingsSectionProps {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly headerAction?: React.ReactNode;
}

/**
 * A settings page: one plain page title, then its SettingsGroups. Web and
 * the Mac app render the same body (no breadcrumb or border). In the Mac app
 * the title lives INSIDE the window title bar strip — vertically centered on
 * the traffic-light row while the strip around it stays the drag region, like
 * Linear's Preferences (certified by the storybook-elevation native-band
 * contract: the title center must sit within 2px of the sidebar toggle).
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
  headerAction,
}: SettingsSectionProps) {
  const isDesktop = useIsElectronRuntime();
  return (
    <section
      id={id}
      aria-label={title}
      className={cn('scroll-mt-6', className)}
    >
      <NavigationDestinationReady destination='settings' />
      {isDesktop ? (
        <div
          data-testid='settings-titlebar'
          data-top-spacing-owner='shell-header'
          data-electron-drag-region='true'
        >
          {/* The 44px child row IS the native band (globals.css pins its
              height to --electron-titlebar-height): centering the title in it
              puts the title on the traffic-light row instead of one band
              below it. Buttons inside are no-drag via the drag-region CSS. */}
          <div className='flex items-center justify-between gap-3 px-(--app-shell-content-padding-x)'>
            <h1 className='min-w-0 truncate text-xl font-medium text-primary-token'>
              {title}
            </h1>
            {headerAction ? (
              <div className='flex shrink-0 items-center gap-2'>
                {headerAction}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className='flex min-h-8 items-center justify-between gap-3 px-(--app-shell-content-padding-x) pt-(--app-shell-content-padding-y)'>
          <h1 className='min-w-0 truncate text-xl font-medium text-primary-token'>
            {title}
          </h1>
          {headerAction ? (
            <div className='flex shrink-0 items-center gap-2'>
              {headerAction}
            </div>
          ) : null}
        </div>
      )}
      <div className='space-y-8 px-(--app-shell-content-padding-x) py-(--app-shell-content-padding-y)'>
        {description ? (
          <p className='text-xs text-secondary-token'>{description}</p>
        ) : null}
        {children}
      </div>
    </section>
  );
}
