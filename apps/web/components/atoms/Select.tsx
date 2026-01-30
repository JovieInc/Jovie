import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  readonly options: SelectOption[];
  readonly placeholder?: string;
  readonly label?: string;
  readonly error?: string;
  readonly required?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
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
          'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
          'focus-visible:border-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-500',
          'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error &&
            'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500',
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
            // biome-ignore lint/a11y/noLabelWithoutControl: Label is associated with select via DOM structure
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              {label}
              {required && <span className='text-red-500 ml-1'>*</span>}
            </label>
          )}
          {selectElement}
          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}
        </div>
      );
    }

    return selectElement;
  }
);

Select.displayName = 'Select';
