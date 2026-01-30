'use client';

import { cn } from '@/lib/utils';

export interface SortableHeaderButtonProps
  extends Readonly<{
    readonly label: string;
    readonly direction?: 'asc' | 'desc';
    readonly onClick: () => void;
    readonly className?: string;
  }> {}

export function SortableHeaderButton({
  label,
  direction,
  onClick,
  className,
}: Readonly<SortableHeaderButtonProps>) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'inline-flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-wide text-left',
        'transition-colors duration-200',
        'hover:text-primary-token hover:bg-surface-2/50',
        'focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent',
        'active:bg-surface-3/50',
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
        {(() => {
          if (!direction) return '⇅';
          return direction === 'asc' ? '▴' : '▾';
        })()}
      </span>
    </button>
  );
}
