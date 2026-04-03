'use client';

import { MENU_ITEM_BASE } from '@jovie/ui';
import { Check } from 'lucide-react';
import { type ReactNode, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  TOOLBAR_MENU_ITEM_CLASS,
  ToolbarMenuRow,
} from '../menus/ToolbarMenuPrimitives';

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
  const trailingVisual =
    count !== undefined || checked ? (
      <span className='flex items-center gap-1'>
        {count !== undefined ? (
          <span className='text-[10px] tabular-nums text-tertiary-token'>
            {count}
          </span>
        ) : null}
        {checked ? <Check className='h-4 w-4 text-primary-token' /> : null}
      </span>
    ) : null;

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
        TOOLBAR_MENU_ITEM_CLASS,
        'w-full',
        checked
          ? 'bg-surface-1 text-primary-token'
          : 'text-secondary-token hover:text-primary-token'
      )}
    >
      <ToolbarMenuRow
        leadingVisual={
          icon ? (
            <span
              className={cn(
                checked ? 'text-primary-token' : 'text-tertiary-token'
              )}
            >
              {icon}
            </span>
          ) : null
        }
        label={label}
        trailingVisual={trailingVisual}
      />
    </button>
  );
}
