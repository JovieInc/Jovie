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
        'sticky top-0 z-10 flex min-h-[var(--linear-app-drawer-header-height)] shrink-0 items-center justify-between border-b border-(--linear-border-subtle) bg-(--linear-app-drawer-surface) px-[var(--linear-app-drawer-padding-x)] py-1',
        className
      )}
    >
      <p className='truncate text-[10px] font-[510] uppercase tracking-[0.06em] text-(--linear-text-tertiary)'>
        {title}
      </p>
      {actions && <div className='flex items-center gap-0.5'>{actions}</div>}
    </div>
  );
}
