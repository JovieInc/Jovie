'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FilterChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

export function FilterChip({
  pressed,
  onClick,
  children,
  className,
  ...rest
}: FilterChipProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      {...rest}
      aria-pressed={pressed}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        pressed
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-transparent text-muted-foreground hover:border-foreground/60',
        className
      )}
    >
      {children}
    </button>
  );
}
