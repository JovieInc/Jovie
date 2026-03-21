'use client';

import * as React from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
    <ContentSurfaceCard
      as='section'
      surface='details'
      id={id}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className={cn('scroll-mt-4 overflow-hidden', className)}
    >
      <ContentSectionHeader
        density='compact'
        className={cn('min-h-0', headerClassName)}
        bodyClassName='space-y-0.5'
        title={<span id={headingId}>{title}</span>}
        subtitle={
          description ? (
            <span id={descriptionId}>{description}</span>
          ) : undefined
        }
        titleClassName={cn(
          'dashboard-heading text-[15px] font-[590] text-primary-token tracking-[-0.02em]',
          titleClassName
        )}
        subtitleClassName={cn(
          'dashboard-body text-[12px] text-secondary-token',
          descriptionClassName
        )}
      />
      <div className='space-y-3 px-4 py-3'>{children}</div>
    </ContentSurfaceCard>
  );
}
