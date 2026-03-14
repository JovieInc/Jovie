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
        'inline-flex w-full items-center gap-2 text-left text-[11px] font-[510] tracking-[0.08em] text-(--linear-text-tertiary) uppercase hover:text-(--linear-text-primary) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className
      )}
    >
      {label}
      <span
        className={cn(
          'text-[9px] transition-opacity',
          direction
            ? 'opacity-100 text-(--linear-text-primary)'
            : 'opacity-50 text-(--linear-text-secondary)'
        )}
        aria-hidden='true'
      >
        {getSortIndicator(direction)}
      </span>
    </button>
  );
}
