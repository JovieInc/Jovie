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
  readonly ariaLabel?: string;
}

export const AmountSelector = memo(function AmountSelector({
  amount,
  isSelected,
  onClick,
  index,
  className,
  disabled,
  ariaLabel,
}: AmountSelectorProps) {
  const handleClick = useCallback(() => {
    onClick(index);
  }, [onClick, index]);

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-pressed={isSelected}
      aria-label={ariaLabel ?? `Select $${amount} tip amount`}
      disabled={disabled}
      aria-disabled={disabled}
      data-selected={isSelected ? 'true' : 'false'}
      className={cn(
        'group relative flex h-12 w-full items-center justify-center rounded-full border px-3 text-center tabular-nums transition-[background-color,border-color,box-shadow,color,opacity] duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        isSelected
          ? 'border-(--profile-pearl-primary-bg) bg-(--profile-pearl-primary-bg) text-(--profile-pearl-primary-fg) shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
          : 'border-black/8 bg-white text-primary-token hover:border-black/14 hover:bg-(--profile-pearl-bg-hover) dark:border-white/12 dark:bg-white/[0.04] dark:hover:border-white/18 dark:hover:bg-white/[0.07]',
        className
      )}
    >
      <span className='text-app font-semibold tracking-[-0.02em]' aria-hidden>
        ${amount}
      </span>
    </button>
  );
});
