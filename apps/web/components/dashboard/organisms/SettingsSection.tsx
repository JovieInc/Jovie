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
      className={cn(
        'scroll-mt-4 rounded-xl border border-subtle/70 bg-surface-0 px-4 py-4 sm:px-5',
        className
      )}
    >
      <div className={cn('mb-3', headerClassName)}>
        <h2
          id={headingId}
          className={cn(
            'dashboard-heading text-[17px] font-[590] text-primary-token tracking-[-0.022em]',
            titleClassName
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            id={descriptionId}
            className={cn(
              'dashboard-body mt-1 text-[13px] text-tertiary-token',
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
