'use client';

import { ArrowLeft } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerBackButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly label: string;
}

export function DrawerBackButton({
  label,
  className,
  type = 'button',
  ...props
}: DrawerBackButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'flex items-center gap-1.5 rounded-[7px] border border-transparent px-1.5 py-1 text-[13px] text-(--linear-text-secondary) transition-[background-color,border-color,color] duration-150 hover:border-(--linear-border-subtle) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
        className
      )}
      {...props}
    >
      <ArrowLeft className='h-3.5 w-3.5' />
      <span className='max-w-[200px] truncate'>{label}</span>
    </button>
  );
}
