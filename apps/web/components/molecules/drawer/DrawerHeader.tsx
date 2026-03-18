'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerHeaderProps {
  /** Title displayed on the left side of the header */
  readonly title: ReactNode;
  /** Additional actions rendered in the header */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function DrawerHeader({ title, actions, className }: DrawerHeaderProps) {
  return (
    <div
      className={cn(
        'min-h-[36px] shrink-0 bg-transparent px-3.5 py-1.5',
        'flex items-center justify-between',
        className
      )}
    >
      <p className='truncate text-[11px] font-[500] uppercase tracking-[0.05em] text-tertiary-token'>
        {title}
      </p>
      {actions && <div className='flex items-center gap-1'>{actions}</div>}
    </div>
  );
}
