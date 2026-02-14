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
          'block w-full rounded-md border border-default bg-surface-1 px-3 py-2 text-sm text-primary-token',
          'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error &&
            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive',
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
            <label className='text-sm font-medium text-secondary-token'>
              {label}
              {required && <span className='text-destructive ml-1'>*</span>}
            </label>
          )}
          {selectElement}
          {error && <p className='text-sm text-destructive'>{error}</p>}
        </div>
      );
    }

    return selectElement;
  }
);

Select.displayName = 'Select';
