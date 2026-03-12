'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerInlineIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly children: ReactNode;
  readonly fadeOnParentHover?: boolean;
}

export function DrawerInlineIconButton({
  children,
  className,
  fadeOnParentHover = false,
  type = 'button',
  ...props
}: DrawerInlineIconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'shrink-0 rounded-[6px] border border-transparent text-(--linear-text-quaternary) transition-[opacity,background-color,border-color,color,box-shadow] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-secondary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
        fadeOnParentHover
          ? 'p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100'
          : 'p-0.5 opacity-60 hover:opacity-100 focus-visible:opacity-100',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
