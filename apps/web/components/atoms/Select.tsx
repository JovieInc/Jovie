import React, { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
  required?: boolean;
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
      id,
      ...rest
    },
    ref
  ) => {
    const {
      'aria-describedby': ariaDescribedByProp,
      'aria-invalid': ariaInvalidProp,
      ...selectProps
    } = rest;

    const selectId = id ?? useId();
    const errorId = error ? `${selectId}-error` : undefined;
    const ariaDescribedBy =
      [ariaDescribedByProp, errorId].filter(Boolean).join(' ') || undefined;
    const ariaInvalid = error ? 'true' : ariaInvalidProp;

    const selectElement = (
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm',
          'focus-visible:border-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-500',
          'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error &&
            'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500',
          className
        )}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        required={required}
        {...selectProps}
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
            <label
              htmlFor={selectId}
              className='text-sm font-medium text-gray-700 dark:text-gray-300'
            >
              {label}
              {required && (
                <>
                  <span aria-hidden='true' className='text-red-500 ml-1'>
                    *
                  </span>
                  <span className='sr-only'> (required)</span>
                </>
              )}
            </label>
          )}
          {selectElement}
          {error && (
            <p
              id={errorId}
              role='alert'
              aria-live='polite'
              className='text-sm text-red-600 dark:text-red-400'
            >
              {error}
            </p>
          )}
        </div>
      );
    }

    return selectElement;
  }
);

Select.displayName = 'Select';
