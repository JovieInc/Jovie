'use client';

import { PlainButton } from '@jovie/ui';
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
    <PlainButton
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
          ? 'border-(--profile-pearl-primary-bg) bg-(--profile-pearl-primary-bg) text-(--profile-pearl-primary-fg) ring-1 ring-on-media/12'
          : 'border-ink-on-media/8 bg-on-media text-primary-token hover:border-ink-on-media/14 hover:bg-(--profile-pearl-bg-hover) dark:border-on-media/12 dark:bg-on-media/4 dark:hover:border-on-media/18 dark:hover:bg-on-media/7',
        className
      )}
    >
      <span className='text-app font-semibold tracking-[-0.02em]' aria-hidden>
        ${amount}
      </span>
    </PlainButton>
  );
});
