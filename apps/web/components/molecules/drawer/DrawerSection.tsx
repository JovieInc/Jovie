'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerSectionProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function DrawerSection({
  title,
  children,
  className,
}: DrawerSectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {title && (
        <div className='text-[10px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
