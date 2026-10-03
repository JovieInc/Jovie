'use client';

import * as React from 'react';
import { NavigationDestinationReady } from '@/components/features/dashboard/NavigationDestinationReady';
import { PageHeader } from '@/components/organisms/PageShell';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import { cn } from '@/lib/utils';
import { DashboardHeader } from './DashboardHeader';

export interface SettingsSectionProps {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly titleClassName?: string;
  readonly descriptionClassName?: string;
  readonly headerAction?: React.ReactNode;
}

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
  titleClassName,
  descriptionClassName,
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
        <DashboardHeader
          breadcrumbs={[{ label: title }]}
          action={headerAction}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-between border-b border-subtle/80',
            titleClassName
          )}
        >
          <PageHeader
            title={title}
            description={description}
            className='border-b-0'
            titleClassName='text-app font-caption'
            subtitleClassName='text-xs text-secondary-token'
          />
          {headerAction}
        </div>
      )}
      <div
        className={cn(
          'space-y-4 px-(--app-shell-content-padding-x) py-(--app-shell-content-padding-y)',
          descriptionClassName
        )}
      >
        {isDesktop && description ? (
          <p className='text-xs text-secondary-token'>{description}</p>
        ) : null}
        {children}
      </div>
    </section>
  );
}
