'use client';

import * as React from 'react';
import { PageHeader } from '@/components/organisms/PageShell';
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
      className={cn('scroll-mt-6', className)}
    >
      <PageHeader
        title={title}
        description={description}
        className={cn('border-b border-subtle/80', titleClassName)}
      />
      <div
        className={cn(
          'space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)',
          descriptionClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}
