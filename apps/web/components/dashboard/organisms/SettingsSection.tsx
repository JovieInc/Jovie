'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SettingsSectionProps {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly headerClassName?: string;
  readonly titleClassName?: string;
}

export function SettingsSection({
  id,
  title,
  children,
  className,
  headerClassName,
  titleClassName,
}: SettingsSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('scroll-mt-4', className)}
    >
      <div className={cn('mb-4 sm:mb-5', headerClassName)}>
        <h2
          id={headingId}
          className={cn(
            'text-2xl font-semibold text-primary-token tracking-tight',
            titleClassName
          )}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
