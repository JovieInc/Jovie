'use client';

import { useCallback } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { DrawerInlineIconButton } from '@/components/molecules/drawer';
import { cn } from '@/lib/utils';

interface FilterSearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onClear: () => void;
  readonly placeholder?: string;
  readonly inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Called when Escape is pressed with no search value */
  readonly onEscape?: () => void;
}

export function FilterSearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  inputRef,
  onEscape,
}: FilterSearchInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (value) {
          // Clear search first, then if pressed again close submenu
          e.preventDefault();
          e.stopPropagation();
          onClear();
        } else if (onEscape) {
          // No search value, propagate escape to close submenu
          onEscape();
        }
      } else if (e.key === 'ArrowDown') {
        // Move focus to first checkbox item
        e.preventDefault();
        const container = (e.target as HTMLElement).closest(
          '[data-radix-menu-content]'
        );
        const firstItem = container?.querySelector(
          'button[data-filter-item]'
        ) as HTMLElement;
        firstItem?.focus();
      }
    },
    [value, onClear, onEscape]
  );

  return (
    <div className='relative'>
      <Icon
        name='Search'
        className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token'
      />
      <input
        ref={inputRef}
        type='text'
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-8 w-full rounded-[10px] border border-transparent bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_52%,transparent)] py-1.5 pl-8 pr-7 text-[12px] tracking-[-0.01em]',
          'text-primary-token placeholder:text-tertiary-token',
          'transition-[background-color,border-color,box-shadow] duration-150',
          'hover:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_60%,transparent)]',
          'focus-visible:border-[color-mix(in_oklab,var(--linear-border-focus)_34%,transparent)] focus-visible:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_68%,transparent)] focus-visible:outline-none focus-visible:ring-0'
        )}
        aria-label={placeholder}
      />
      {value && (
        <DrawerInlineIconButton
          onClick={onClear}
          className='absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[6px] p-0.5 text-tertiary-token hover:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_70%,transparent)] hover:text-secondary-token'
          aria-label='Clear search'
        >
          <Icon name='X' className='h-3 w-3' />
        </DrawerInlineIconButton>
      )}
    </div>
  );
}
