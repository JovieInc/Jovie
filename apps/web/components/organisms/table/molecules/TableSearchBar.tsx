'use client';

/**
 * Table Search Bar Component
 *
 * Search input with debouncing powered by centralized TanStack Pacer hooks.
 */

import { useEffect } from 'react';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { useDebouncedInput } from '@/lib/pacer/hooks';

export interface TableSearchBarProps
  extends Readonly<{
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly placeholder?: string;
    readonly debounceMs?: number;
    readonly className?: string;
  }> {}

export function TableSearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
}: TableSearchBarProps) {
  const {
    value: localValue,
    setValue,
    clear,
  } = useDebouncedInput({
    initialValue: value,
    delay: debounceMs,
    onDebouncedChange: onChange,
  });

  // Sync external value changes to local state
  useEffect(() => {
    setValue(value);
  }, [value, setValue]);

  return (
    <AppSearchField
      value={localValue}
      onChange={setValue}
      onClear={() => {
        clear();
        onChange('');
      }}
      placeholder={placeholder}
      ariaLabel={placeholder}
      className={className}
    />
  );
}
