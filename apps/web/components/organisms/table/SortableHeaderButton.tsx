'use client';

import { cn } from '@/lib/utils';

export interface SortableHeaderButtonProps {
  readonly label: string;
  readonly direction?: 'asc' | 'desc';
  readonly onClick: () => void;
  readonly className?: string;
}

function getSortIndicator(direction?: 'asc' | 'desc'): string {
  if (!direction) return '⇅';
  return direction === 'asc' ? '▴' : '▾';
}

export function SortableHeaderButton({
  label,
  direction,
  onClick,
  className,
}: SortableHeaderButtonProps) {
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
      <span
        className={cn(
          'text-[10px] transition-opacity',
          direction
            ? 'opacity-100 text-primary-token'
            : 'opacity-50 text-secondary-token'
        )}
        aria-hidden='true'
      >
        {getSortIndicator(direction)}
      </span>
    </button>
  );
}
