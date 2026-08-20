'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export interface NativeSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface NativeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  readonly options: readonly NativeSelectOption[];
  readonly placeholder?: string;
  readonly label?: string;
  readonly error?: string;
}

function joinIds(...ids: Array<string | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

/**
 * Canonical enhanced native select.
 *
 * Use this when native form submission, change events, or an
 * `HTMLSelectElement` ref are part of the contract. Use the Radix-backed
 * `Select` family for custom menu composition.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    {
      options,
      placeholder = 'Select an option',
      label,
      error,
      required = false,
      className,
      id: providedId,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const id = providedId ?? `native-select-${generatedId}`;
    const errorId = `${id}-error`;
    const hasAriaInvalid =
      ariaInvalid !== undefined &&
      ariaInvalid !== false &&
      ariaInvalid !== 'false';
    const isInvalid = Boolean(error) || hasAriaInvalid;
    const describedBy = joinIds(ariaDescribedBy, error ? errorId : undefined);

    const select = (
      <select
        ref={ref}
        id={id}
        data-slot='native-select'
        data-state={isInvalid ? 'invalid' : 'default'}
        required={required}
        aria-describedby={describedBy}
        aria-invalid={error ? true : ariaInvalid}
        className={cn(
          'block h-9 w-full rounded-md border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 text-[13px] font-normal text-(--linear-text-primary)',
          'hover:border-(--linear-border-default)',
          'focus-visible:border-(--linear-border-focus) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/24',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isInvalid &&
            'border-(--linear-error) hover:border-(--linear-error) focus-visible:border-(--linear-error) focus-visible:ring-(--linear-error)/24',
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

    if (!label && !error) return select;

    return (
      <div data-slot='native-select-field' className='space-y-1.5'>
        {label ? (
          <label
            data-slot='native-select-label'
            htmlFor={id}
            className='text-sm font-medium text-secondary-token'
          >
            {label}
            {required ? (
              <span className='ml-1 text-destructive' aria-hidden='true'>
                *
              </span>
            ) : null}
          </label>
        ) : null}
        {select}
        {error ? (
          <p
            id={errorId}
            data-slot='native-select-error'
            className='text-sm text-destructive'
            role='alert'
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
