'use client';

import React, { cloneElement, isValidElement, useId } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  id?: string;
  helpText?: string;
}

export function FormField({
  label,
  error,
  required = false,
  className,
  children,
  id: providedId,
  helpText,
}: Readonly<FormFieldProps>) {
  // Generate unique IDs for accessibility connections
  const uniqueId = useId();
  const id = providedId || `field-${uniqueId}`;
  const errorId = `${id}-error`;
  const helpTextId = `${id}-help`;

  // Determine which description elements to connect via aria-describedby
  const getDescribedByIds = () => {
    const ids = [];
    if (helpText) ids.push(helpTextId);
    if (error) ids.push(errorId);
    return ids.length > 0 ? ids.join(' ') : undefined;
  };

  // Clone the child element to add accessibility attributes
  const childrenWithProps = React.Children.map(children, child => {
    if (isValidElement(child)) {
      return cloneElement(child, {
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': getDescribedByIds(),
        'aria-required': required ? 'true' : undefined,
      } as Record<string, unknown>);
    }
    return child;
  });

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label
          htmlFor={id}
          className='text-sm font-medium text-gray-700 dark:text-gray-300'
        >
          {label}
          {required && (
            <span className='text-red-500 ml-1' aria-hidden='true'>
              *
            </span>
          )}
          {required && <span className='sr-only'>(required)</span>}
        </label>
      )}

      {helpText && (
        <p id={helpTextId} className='text-xs text-gray-500 dark:text-gray-400'>
          {helpText}
        </p>
      )}

      {childrenWithProps}

      {error && (
        <p
          id={errorId}
          className='text-sm text-red-600 dark:text-red-400'
          role='alert'
          aria-live='polite'
        >
          {error}
        </p>
      )}
    </div>
  );
}
