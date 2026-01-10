'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SortableHeaderButtonProps {
  label: string;
  direction?: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}

export function SortableHeaderButton({
  label,
  direction,
  onClick,
  className,
}: SortableHeaderButtonProps) {
  const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'inline-flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wide text-left hover:text-primary-token focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className
      )}
    >
      {label}
      <SortIcon
        className={cn(
          'h-3 w-3 transition-opacity',
          direction
            ? 'opacity-100 text-primary-token'
            : 'opacity-50 text-secondary-token'
        )}
        aria-hidden='true'
      />
    </button>
  );
}
