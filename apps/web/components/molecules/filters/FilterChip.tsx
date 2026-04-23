'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FilterChipProps {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
  readonly 'aria-label'?: string;
}

export function FilterChip({
  pressed,
  onClick,
  children,
  className,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: FilterChipProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      data-testid={testId}
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
