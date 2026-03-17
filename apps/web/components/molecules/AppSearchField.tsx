'use client';

import { Input } from '@jovie/ui';
import { Search, X } from 'lucide-react';
import type * as React from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';

export interface AppSearchFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onClear?: () => void;
  readonly onEscape?: () => void;
  readonly placeholder?: string;
  readonly ariaLabel: string;
  readonly autoFocus?: boolean;
  readonly inputRef?: React.Ref<HTMLInputElement>;
  readonly showClearButton?: boolean;
  readonly className?: string;
  readonly inputClassName?: string;
}

export function AppSearchField({
  value,
  onChange,
  onClear,
  onEscape,
  placeholder = 'Search…',
  ariaLabel,
  autoFocus = false,
  inputRef,
  showClearButton = true,
  className,
  inputClassName,
}: AppSearchFieldProps) {
  return (
    <div
      className={cn(
        'flex h-(--linear-app-control-height-sm) items-center gap-2 rounded-(--linear-app-control-radius) border border-subtle bg-surface-0 px-2.5 text-primary-token transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-(--linear-border-focus) focus-within:bg-surface-0 focus-within:ring-2 focus-within:ring-(--linear-border-focus)/20',
        className
      )}
    >
      <Search className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        type='search'
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') onEscape?.();
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          'h-full border-0 bg-transparent px-0 text-[13px] tracking-[-0.01em] shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0',
          inputClassName
        )}
      />
      {showClearButton && value ? (
        <AppIconButton
          type='button'
          ariaLabel='Clear search'
          className='border-transparent bg-transparent text-tertiary-token hover:border-subtle hover:bg-surface-1 hover:text-secondary-token'
          onClick={() => {
            onChange('');
            onClear?.();
          }}
        >
          <X />
        </AppIconButton>
      ) : null}
    </div>
  );
}
