'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerHeaderProps {
  /** Title displayed on the left side of the header */
  readonly title?: ReactNode;
  /** Additional actions rendered in the header */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function DrawerHeader({ title, actions, className }: DrawerHeaderProps) {
  return (
    <div
      className={cn(
        'min-h-[38px] shrink-0 bg-transparent px-3 py-1.5',
        'flex items-center justify-between gap-3',
        className
      )}
    >
      <div className='min-w-0 flex-1'>
        {typeof title === 'string' ? (
          <p className='truncate text-xs font-semibold tracking-[-0.012em] text-primary-token'>
            {title}
          </p>
        ) : (
          (title ?? <div aria-hidden='true' className='h-4' />)
        )}
      </div>
      {actions && <div className='flex items-center gap-1'>{actions}</div>}
    </div>
  );
}
