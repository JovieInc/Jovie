'use client';

import { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface AmountSelectorProps {
  amount: number;
  isSelected: boolean;
  onClick: (index: number) => void;
  index: number;
  className?: string;
  disabled?: boolean;
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
        'w-full aspect-square rounded-xl border text-lg font-semibold transition-colors flex items-center justify-center',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        'bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100',
        isSelected
          ? 'border-purple-500 ring-2 ring-purple-200/60 dark:ring-purple-600/30'
          : 'border-black/40 hover:border-black/70 dark:border-white/30 dark:hover:border-white/60',
        className
      )}
    >
      <span aria-hidden>{'$' + amount}</span>
    </button>
  );
});
