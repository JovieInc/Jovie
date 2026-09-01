'use client';

import { Button } from '@jovie/ui';

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
  // Table headers keep their established compact visual geometry while the
  // canonical md Button contract preserves the 44px hit target.
  return (
    <Button
      type='button'
      variant='ghost'
      size='md'
      onClick={onClick}
      className={cn(
        'inline-flex h-auto w-full items-center justify-start text-left text-app font-caption tracking-normal',
        'rounded-full px-1.5 py-1 transition-[background-color,color,box-shadow] duration-subtle',
        'text-secondary-token hover:bg-surface-1 hover:text-primary-token',
        'active:bg-surface-0',
        className
      )}
    >
      <span className='inline-flex items-center gap-2'>
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
          {getSortIndicator(direction)}
        </span>
      </span>
    </Button>
  );
}
