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
    <div className={cn('space-y-1.5', className)}>
      {title && (
        <div className='text-[11px] font-[510] uppercase tracking-[0.05em] text-quaternary-token'>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
