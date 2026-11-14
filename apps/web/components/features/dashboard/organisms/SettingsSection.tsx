'use client';

import type * as React from 'react';
import { NavigationDestinationReady } from '@/components/features/dashboard/NavigationDestinationReady';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';

export interface SettingsSectionProps {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly headerAction?: React.ReactNode;
}

/**
 * A settings page: one plain page title, then its SettingsGroups. Web and
 * the Mac app render the same body (no breadcrumb, border or description).
 * In the Mac app an empty strip above the title owns the window title bar:
 * it clears the traffic lights and drags the window, like Linear's Preferences.
 */
export function SettingsSection({
  id,
  title,
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
          aria-hidden='true'
        >
          <div />
        </div>
      ) : null}
      <div className='flex min-h-8 items-center justify-between gap-3 px-(--app-shell-content-padding-x) pt-(--app-shell-content-padding-y)'>
        <h1 className='min-w-0 truncate text-xl font-medium text-primary-token'>
          {title}
        </h1>
        {headerAction ? (
          <div className='flex shrink-0 items-center gap-2'>{headerAction}</div>
        ) : null}
      </div>
      <div className='space-y-8 px-(--app-shell-content-padding-x) py-(--app-shell-content-padding-y)'>
        {children}
      </div>
    </section>
  );
}
