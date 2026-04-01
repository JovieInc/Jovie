'use client';

import { MENU_ITEM_BASE } from '@jovie/ui';
import { Check } from 'lucide-react';
import { type ReactNode, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface FilterCheckboxItemProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly count?: number;
  readonly checked: boolean;
  readonly onCheckedChange: () => void;
  /** Ref to the search input to return focus on ArrowUp from first item */
  readonly searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function FilterCheckboxItem({
  label,
  icon,
  count,
  checked,
  onCheckedChange,
  searchInputRef,
}: FilterCheckboxItemProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (e.target as HTMLElement)
          .nextElementSibling as HTMLElement;
        if (next?.hasAttribute('data-filter-item')) {
          next.focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (e.target as HTMLElement)
          .previousElementSibling as HTMLElement;
        if (prev?.hasAttribute('data-filter-item')) {
          prev.focus();
        } else {
          // At first item, go back to search input
          searchInputRef?.current?.focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Return focus to search input on Escape
        searchInputRef?.current?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onCheckedChange();
      }
    },
    [onCheckedChange, searchInputRef]
  );

  return (
    <button
      type='button'
      data-filter-item
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        onCheckedChange();
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        MENU_ITEM_BASE,
        'w-full rounded-[6px] border border-transparent',
        checked && 'text-primary-token'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
          checked
            ? 'border-(--linear-accent) bg-(--linear-accent) text-white'
            : 'border-subtle bg-surface-1'
        )}
      >
        {checked && <Check className='h-3 w-3' />}
      </span>
      {icon && (
        <span className='flex h-4 w-4 shrink-0 items-center justify-center text-tertiary-token'>
          {icon}
        </span>
      )}
      <span className='flex-1 truncate text-left'>{label}</span>
      {count !== undefined && (
        <span className='text-[10px] tabular-nums text-tertiary-token'>
          {count}
        </span>
      )}
    </button>
  );
}
