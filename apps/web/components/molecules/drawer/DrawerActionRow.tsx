'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerActionRowProps {
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly trailing?: ReactNode;
  readonly onClick?: () => void;
  readonly className?: string;
}

export function DrawerActionRow({
  icon,
  label,
  trailing,
  onClick,
  className,
}: DrawerActionRowProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'flex min-h-[36px] w-full items-center gap-2 rounded-full border border-transparent px-2.5 py-1.5 text-left text-xs text-secondary-token transition-[background-color,border-color,color,box-shadow] duration-150',
        'hover:border-(--linear-app-frame-seam) hover:bg-surface-1 hover:text-primary-token',
        'focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1 focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
        className
      )}
    >
      {icon ? <span className='shrink-0'>{icon}</span> : null}
      <span>{label}</span>
      {trailing ? <span className='ml-auto min-w-0'>{trailing}</span> : null}
    </button>
  );
}
