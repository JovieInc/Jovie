'use client';

import { Button } from '@jovie/ui';

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
    <Button
      type='button'
      variant='ghost'
      onClick={onClick}
      className={cn(
        'inline-flex h-auto w-full items-center justify-start gap-2 text-left text-app font-medium tracking-normal',
        'rounded-full px-1.5 py-1 transition-[background-color,color,box-shadow] duration-subtle',
        'text-secondary-token hover:bg-surface-1 hover:text-primary-token',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'active:bg-surface-0',
        className
      )}
    >
      {label}
      <span
        className={cn(
          'text-3xs transition-opacity',
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
    </Button>
  );
}
