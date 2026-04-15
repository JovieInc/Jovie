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
        'group relative flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-[16px] border text-center transition-[background-color,border-color,color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        isSelected
          ? 'border-[color:var(--profile-pearl-primary-bg)] bg-[var(--profile-pearl-primary-bg)] text-[var(--profile-pearl-primary-fg)] ring-1 ring-white/10'
          : 'border-black/6 bg-white text-primary-token ring-1 ring-black/[0.03] hover:border-black/10 hover:bg-[var(--profile-pearl-bg-hover)] hover:ring-black/[0.05] dark:border-white/10 dark:bg-[rgba(255,255,255,0.045)] dark:ring-white/[0.04] dark:hover:border-white/14 dark:hover:bg-[var(--profile-pearl-bg-hover)] dark:hover:ring-white/[0.06]',
        className
      )}
    >
      <span
        className={cn(
          'text-[10px] font-medium tracking-[0.08em]',
          isSelected
            ? 'text-[var(--profile-pearl-primary-fg)]/72'
            : 'text-secondary-token'
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
