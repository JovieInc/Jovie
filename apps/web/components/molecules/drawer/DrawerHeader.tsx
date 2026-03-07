'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerHeaderProps {
  /** Title displayed on the left side of the header */
  readonly title: ReactNode;
  /** Close handler — passed down for the actions area to handle */
  readonly onClose?: () => void;
  /** Additional actions rendered in the header */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function DrawerHeader({ title, actions, className }: DrawerHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-2 min-h-12 shrink-0',
        className
      )}
    >
      <p className='text-xs font-medium text-secondary-token truncate'>
        {title}
      </p>
      {actions && <div className='flex items-center gap-1'>{actions}</div>}
    </div>
  );
}
