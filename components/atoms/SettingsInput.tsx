'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SettingsInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  prefix?: string;
  error?: string;
  className?: string;
}

export function SettingsInput({
  label,
  description,
  prefix,
  error,
  className,
  id,
  ...props
}: SettingsInputProps) {
  const inputId =
    id || `settings-input-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className='block text-sm font-medium text-primary mb-2'
      >
        {label}
      </label>

      {description && (
        <p className='text-sm text-secondary mb-2'>{description}</p>
      )}

      <div className='relative'>
        {prefix ? (
          <div className='flex rounded-lg shadow-sm'>
            <span className='inline-flex items-center px-3 rounded-l-lg border border-r-0 border-subtle bg-surface-2 text-secondary text-sm select-none'>
              {prefix}
            </span>
            <input
              id={inputId}
              className={cn(
                'flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-lg border border-subtle bg-surface-1 text-primary placeholder:text-secondary',
                'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm transition-colors',
                error && 'border-red-500 focus-visible:ring-red-500'
              )}
              {...props}
            />
          </div>
        ) : (
          <input
            id={inputId}
            className={cn(
              'block w-full px-3 py-2 border border-subtle rounded-lg bg-surface-1 text-primary placeholder:text-secondary',
              'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:border-transparent sm:text-sm shadow-sm transition-colors',
              error && 'border-red-500 focus-visible:ring-red-500'
            )}
            {...props}
          />
        )}
      </div>

      {error && <p className='mt-2 text-sm text-red-600'>{error}</p>}
    </div>
  );
}
