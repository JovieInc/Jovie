'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SettingsSectionProps {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly titleClassName?: string;
  readonly descriptionClassName?: string;
}

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
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
      <div className='space-y-0.5 pb-3'>
        <h2
          id={headingId}
          className={cn(
            'dashboard-heading text-[15px] font-[590] tracking-[-0.02em] text-primary-token',
            titleClassName
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            id={descriptionId}
            className={cn(
              'dashboard-body text-[12px] text-secondary-token',
              descriptionClassName
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      <div className='space-y-3'>{children}</div>
    </section>
  );
}
