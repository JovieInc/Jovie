'use client';

import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import * as React from 'react';
import { Input } from '@/components/atoms/Input';
import { cn } from '@/lib/utils';

interface LinkSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function LinkSearch({
  value,
  onChange,
  placeholder = 'Search links...',
  className,
}: LinkSearchProps) {
  const handleClear = () => {
    onChange('');
  };

  return (
    <div className={cn('relative', className)}>
      <div className='absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none'>
        <MagnifyingGlassIcon className='h-4 w-4 text-muted-foreground' />
      </div>

      <Input
        type='text'
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className='pl-10 pr-10'
      />

      {value && (
        <div className='absolute inset-y-0 right-0 flex items-center pr-1'>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClear}
            className='h-7 w-7 p-0 hover:bg-muted'
          >
            <XMarkIcon className='h-4 w-4' />
            <span className='sr-only'>Clear search</span>
          </Button>
        </div>
      )}
    </div>
  );
}
