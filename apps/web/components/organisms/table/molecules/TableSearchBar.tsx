'use client';

/**
 * Table Search Bar Component
 *
 * Search input with debouncing powered by TanStack Pacer.
 *
 * @see https://tanstack.com/pacer
 */

import { Input } from '@jovie/ui';
import { useDebouncer } from '@tanstack/react-pacer';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function TableSearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
}: TableSearchBarProps) {
  const [localValue, setLocalValue] = useState(value);

  // TanStack Pacer debouncer for search
  const debouncer = useDebouncer(
    (newValue: string) => {
      onChange(newValue);
    },
    { wait: debounceMs }
  );

  // Sync external value changes to local state
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Handle input change with debouncing
  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);
      if (newValue !== value) {
        debouncer.maybeExecute(newValue);
      }
    },
    [value, debouncer]
  );

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className='absolute left-3 h-4 w-4 text-tertiary-token pointer-events-none' />
      <Input
        type='search'
        value={localValue}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        className='pl-9 h-9 text-sm'
      />
    </div>
  );
}
