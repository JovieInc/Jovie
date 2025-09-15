'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
  required?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      options,
      placeholder = 'Select an option',
      label,
      error,
      required = false,
      className,
      ...props
    },
    ref
  ) => {
    const selectElement = (
      <select
        ref={ref}
        className={cn(
          'block w-full rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-red-500 focus-visible:ring-red-500',
          className
        )}
        {...props}
      >
        <option value=''>{placeholder}</option>
        {options.map(option => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    );

    if (label || error) {
      return (
        <div className='space-y-2'>
          {label && (
            <label className='text-sm font-medium text-secondary-token'>
              {label}
              {required && <span className='text-red-500 ml-1'>*</span>}
            </label>
          )}
          {selectElement}
          {error && <p className='text-sm text-red-600'>{error}</p>}
        </div>
      );
    }

    return selectElement;
  }
);
Select.displayName = 'Select';
