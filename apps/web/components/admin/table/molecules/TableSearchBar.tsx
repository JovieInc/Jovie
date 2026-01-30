'use client';

import { Input } from '@jovie/ui';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TableSearchBarProps
  extends Readonly<{
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    debounceMs?: number;
    className?: string;
  }> {}

export function TableSearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
}: Readonly<TableSearchBarProps>) {
  const [localValue, setLocalValue] = useState(value);

  // Sync external value changes to local state
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce the onChange callback
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localValue !== value) {
        onChange(localValue);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange, value]);

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className='absolute left-3 h-3.5 w-3.5 text-tertiary-token pointer-events-none' />
      <Input
        type='search'
        value={localValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setLocalValue(e.target.value)
        }
        placeholder={placeholder}
        className='pl-9 h-9 text-sm'
      />
    </div>
  );
}
