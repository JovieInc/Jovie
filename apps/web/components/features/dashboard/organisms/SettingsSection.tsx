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
      className={cn('scroll-mt-6 space-y-5', className)}
    >
      <div className='space-y-1'>
        <h2
          id={headingId}
          className={cn(
            'dashboard-heading text-[24px] font-[590] tracking-[-0.035em] text-primary-token sm:text-[28px]',
            titleClassName
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            id={descriptionId}
            data-testid={`${id}-description`}
            className={cn(
              'dashboard-body max-w-[60ch] text-[13px] leading-[19px] text-secondary-token',
              descriptionClassName
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      <div className='space-y-4'>{children}</div>
    </section>
  );
}
