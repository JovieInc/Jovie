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
        'min-h-[50px] shrink-0 border-b border-(--linear-app-frame-seam) bg-(--linear-bg-surface-0) px-4.5 py-3',
        'flex items-center justify-between',
        className
      )}
    >
      <p className='truncate text-[12.5px] font-[510] text-(--linear-text-secondary)'>
        {title}
      </p>
      {actions && <div className='flex items-center gap-1'>{actions}</div>}
    </div>
  );
}
