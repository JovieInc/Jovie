'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section id={id} className={cn('scroll-mt-4', className)}>
      <div className='mb-6'>
        <h1 className='text-2xl font-semibold tracking-tight text-primary'>
          {title}
        </h1>
        <p className='mt-1 text-sm text-secondary'>{description}</p>
      </div>
      {children}
    </section>
  );
}
