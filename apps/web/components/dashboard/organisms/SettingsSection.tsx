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
  readonly descriptionClassName?: string;
}

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
  headerClassName,
  titleClassName,
  descriptionClassName,
}: SettingsSectionProps) {
  const headingId = `${id}-heading`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className={cn('scroll-mt-4', className)}
    >
      <div className={cn('mb-6', headerClassName)}>
        <h2
          id={headingId}
          className={cn(
            'text-2xl font-semibold tracking-tight text-primary',
            titleClassName
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            id={descriptionId}
            className={cn('mt-1 text-sm text-secondary', descriptionClassName)}
          >
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
