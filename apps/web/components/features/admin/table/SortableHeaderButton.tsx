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
        'inline-flex w-full items-center gap-2 text-left text-xs font-medium uppercase tracking-[0.08em]',
        'rounded-[7px] px-1.5 py-1 transition-[background-color,color,box-shadow] duration-150',
        'text-tertiary-token hover:bg-surface-1 hover:text-primary-token',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
        'active:bg-surface-0',
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
