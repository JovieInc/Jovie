'use client';

import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface AmountSelectorProps {
  readonly amount: number;
  readonly isSelected: boolean;
  readonly onClick: (index: number) => void;
  readonly index: number;
  readonly className?: string;
  readonly disabled?: boolean;
}

export const AmountSelector = memo(function AmountSelector({
  amount,
  isSelected,
  onClick,
  index,
  className,
  disabled,
}: AmountSelectorProps) {
  const handleClick = useCallback(() => {
    onClick(index);
  }, [onClick, index]);

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-pressed={isSelected}
      aria-label={`Select $${amount} tip amount`}
      disabled={disabled}
      aria-disabled={disabled}
      className={cn(
        'group relative w-full aspect-square rounded-2xl border text-center transition-all duration-150 ease-out flex flex-col items-center justify-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        isSelected
          ? 'bg-btn-primary text-btn-primary-foreground shadow-sm'
          : 'border-default bg-surface-1 text-primary-token hover:border-strong hover:bg-surface-2 hover:shadow-sm',
        className
      )}
    >
      <span
        className={cn(
          'text-[10px] font-medium uppercase tracking-wider',
          isSelected ? 'text-btn-primary-foreground/70' : 'text-secondary-token'
        )}
        aria-hidden
      >
        USD
      </span>
      <span
        className='text-2xl font-semibold tabular-nums tracking-tight'
        aria-hidden
      >
        ${amount}
      </span>
    </button>
  );
});
