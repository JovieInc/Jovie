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
        'sticky top-0 z-10 flex min-h-[var(--linear-app-drawer-header-height)] shrink-0 items-center justify-between border-b border-(--linear-border-subtle) bg-(--linear-app-drawer-surface) px-[var(--linear-app-drawer-padding-x)] py-2',
        className
      )}
    >
      <p className='truncate text-[13px] font-[510] tracking-[-0.01em] text-(--linear-text-primary)'>
        {title}
      </p>
      {actions && <div className='flex items-center gap-1'>{actions}</div>}
    </div>
  );
}
