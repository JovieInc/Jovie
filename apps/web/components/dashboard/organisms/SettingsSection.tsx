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
      <div className={cn('mb-3 sm:mb-5', headerClassName)}>
        <h2
          id={headingId}
          className={cn(
            'text-base sm:text-lg font-semibold text-primary-token',
            titleClassName
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            id={descriptionId}
            className={cn(
              'mt-1 sm:mt-1.5 text-xs sm:text-sm text-secondary-token line-clamp-2 sm:line-clamp-none',
              descriptionClassName
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
