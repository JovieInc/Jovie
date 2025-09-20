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
    <section id={id} className={cn('scroll-mt-6', className)}>
      <div className='bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden'>
        {/* Section Header */}
        <div className='px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'>
          <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
            {title}
          </h2>
          <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
            {description}
          </p>
        </div>

        {/* Section Content */}
        <div className='p-6'>{children}</div>
      </div>
    </section>
  );
}
