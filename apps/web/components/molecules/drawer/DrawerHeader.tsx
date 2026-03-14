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
        'flex items-center justify-between border-b border-subtle px-5 py-3 min-h-14 shrink-0 bg-surface-0',
        className
      )}
    >
      <p className='text-[13px] font-[510] text-secondary-token truncate'>
        {title}
      </p>
      {actions && <div className='flex items-center gap-1'>{actions}</div>}
    </div>
  );
}
