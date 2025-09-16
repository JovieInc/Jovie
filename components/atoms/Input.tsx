import * as Headless from '@headlessui/react';
import { clsx } from 'clsx';
import React, { forwardRef, useId } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

export function InputGroup({
  children,
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      data-slot='control'
      className={clsx(
        'relative isolate block',
        '[&_input]:has-[[data-slot=icon]:first-child]:pl-10 [&_input]:has-[[data-slot=icon]:last-child]:pr-10 sm:[&_input]:has-[[data-slot=icon]:first-child]:pl-8 sm:[&_input]:has-[[data-slot=icon]:last-child]:pr-8',
        'data-[slot=icon]:*:pointer-events-none data-[slot=icon]:*:absolute data-[slot=icon]:*:top-3 data-[slot=icon]:*:z-10 data-[slot=icon]:*:size-5 sm:data-[slot=icon]:*:top-2.5 sm:data-[slot=icon]:*:size-4',
        '[&>[data-slot=icon]:first-child]:left-3 sm:[&>[data-slot=icon]:first-child]:left-2.5 [&>[data-slot=icon]:last-child]:right-3 sm:[&>[data-slot=icon]:last-child]:right-2.5',
        'data-[slot=icon]:*:text-zinc-500 dark:data-[slot=icon]:*:text-zinc-400'
      )}
    >
      {children}
    </span>
  );
}

const dateTypes = ['date', 'datetime-local', 'month', 'time', 'week'];
type DateType = (typeof dateTypes)[number];

// Legacy interface for backward compatibility
interface LegacyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  loading?: boolean;
}

// New interface for Catalyst UI Kit
type InputProps = {
  className?: string;
  type?:
    | 'email'
    | 'number'
    | 'password'
    | 'search'
    | 'tel'
    | 'text'
    | 'url'
    | DateType;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  inputClassName?: string;
  trailing?: React.ReactNode;
  statusIcon?: React.ReactNode;
  helpText?: string;
  validationState?: 'valid' | 'invalid' | 'pending' | null;
} & Omit<Headless.InputProps, 'as' | 'className'>;

export const Input = forwardRef(function Input(
  {
    className,
    label,
    error,
    loading,
    inputClassName,
    trailing,
    statusIcon,
    helpText,
    validationState,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...props
  }: InputProps & Partial<LegacyInputProps>,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  // Generate unique IDs for accessibility connections
  const uniqueId = useId();
  const id = props.id || `input-${uniqueId}`;
  const errorId = `${id}-error`;
  const helpTextId = `${id}-help`;

  // Determine validation state
  const isInvalid =
    validationState === 'invalid' || error || ariaInvalid === 'true';
  const isValid = validationState === 'valid';
  const isPending = validationState === 'pending' || loading;

  // Determine which description elements to connect via aria-describedby
  const getDescribedByIds = () => {
    const ids = [];
    if (ariaDescribedBy) ids.push(ariaDescribedBy);
    if (helpText) ids.push(helpTextId);
    if (error) ids.push(errorId);
    return ids.length > 0 ? ids.join(' ') : undefined;
  };

  const inputElement = (
    <span
      data-slot='control'
      data-invalid={isInvalid || undefined}
      data-valid={isValid || undefined}
      data-disabled={props.disabled || undefined}
      className={clsx([
        className,
        // Basic layout
        'relative block w-full',
        // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
        'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-xs',
        // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
        'dark:before:hidden',
        // Focus ring with glow effect
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset sm:focus-within:after:ring-2 focus-within:after:ring-accent focus-within:shadow-lg focus-within:shadow-accent/20 after:transition-all after:duration-200',
        // Disabled state
        'has-data-disabled:opacity-50 has-data-disabled:before:bg-zinc-950/5 has-data-disabled:before:shadow-none',
        // Invalid state
        'has-data-invalid:before:shadow-red-500/10',
        // Error state for legacy support
        isInvalid && 'has-data-invalid:before:shadow-red-500/10',
        // Valid state
        isValid && 'has-data-valid:before:shadow-green-500/10',
      ])}
    >
      <Headless.Input
        ref={ref}
        id={id}
        aria-invalid={isInvalid ? 'true' : undefined}
        aria-busy={isPending ? 'true' : undefined}
        aria-describedby={getDescribedByIds()}
        {...props}
        className={clsx([
          // Date classes
          props.type &&
            dateTypes.includes(props.type) && [
              '[&::-webkit-datetime-edit-fields-wrapper]:p-0',
              '[&::-webkit-date-and-time-value]:min-h-[1.5em]',
              '[&::-webkit-datetime-edit]:inline-flex',
              '[&::-webkit-datetime-edit]:p-0',
              '[&::-webkit-datetime-edit-year-field]:p-0',
              '[&::-webkit-datetime-edit-month-field]:p-0',
              '[&::-webkit-datetime-edit-day-field]:p-0',
              '[&::-webkit-datetime-edit-hour-field]:p-0',
              '[&::-webkit-datetime-edit-minute-field]:p-0',
              '[&::-webkit-datetime-edit-second-field]:p-0',
              '[&::-webkit-datetime-edit-millisecond-field]:p-0',
              '[&::-webkit-datetime-edit-meridiem-field]:p-0',
            ],
          // Basic layout
          'relative block w-full appearance-none rounded-lg',
          // Size variants - padding and typography
          props.size === 'sm' && [
            'px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1.5)-1px)] sm:px-[calc(--spacing(2)-1px)] sm:py-[calc(--spacing(1)-1px)]',
            'text-sm/5 sm:text-xs/5',
          ],
          (!props.size || props.size === 'md') && [
            'px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
            'text-base/6 sm:text-sm/6',
          ],
          props.size === 'lg' && [
            'px-[calc(--spacing(4)-1px)] py-[calc(--spacing(3)-1px)] sm:px-[calc(--spacing(3.5)-1px)] sm:py-[calc(--spacing(2.5)-1px)]',
            'text-lg/7 sm:text-base/6',
          ],
          // Typography colors
          'text-zinc-950 placeholder:text-zinc-500 dark:text-white',
          // Border
          'border border-zinc-950/10 data-hover:border-zinc-950/20 dark:border-white/10 dark:data-hover:border-white/20',
          // Background color
          'bg-transparent dark:bg-white/5',
          // Hide default focus styles
          'focus-visible:outline-hidden',
          // Invalid state
          'data-invalid:border-red-500 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-500 dark:data-invalid:data-hover:border-red-500',
          // Valid state
          isValid &&
            'border-green-500 data-hover:border-green-500 dark:border-green-500 dark:data-hover:border-green-500',
          // Disabled state
          'data-disabled:border-zinc-950/20 dark:data-disabled:border-white/15 dark:data-disabled:bg-white/2.5 dark:data-hover:data-disabled:border-white/15',
          // System icons
          'dark:scheme-dark',
          // Error state for legacy support
          isInvalid &&
            'border-red-500 data-hover:border-red-500 dark:border-red-500 dark:data-hover:border-red-500',
          // Loading state - add right padding for spinner (size-aware)
          isPending && [
            props.size === 'sm' && 'pr-8 sm:pr-6',
            (!props.size || props.size === 'md') && 'pr-10 sm:pr-8',
            props.size === 'lg' && 'pr-12 sm:pr-10',
          ],
          // Status icon - add right padding for icon (size-aware)
          statusIcon && [
            props.size === 'sm' && 'pr-8 sm:pr-6',
            (!props.size || props.size === 'md') && 'pr-10 sm:pr-8',
            props.size === 'lg' && 'pr-12 sm:pr-10',
          ],
          // Trailing slot - add more right padding for action button (size-aware)
          trailing && [
            props.size === 'sm' && 'pr-24 sm:pr-26',
            (!props.size || props.size === 'md') && 'pr-28 sm:pr-32',
            props.size === 'lg' && 'pr-32 sm:pr-36',
          ],
          inputClassName,
        ])}
      />

      {/* Status Icon (validation state) */}
      {statusIcon && !isPending && (
        <div
          className={clsx([
            'absolute top-1/2 -translate-y-1/2',
            props.size === 'sm' && 'right-2 sm:right-1.5',
            (!props.size || props.size === 'md') && 'right-3 sm:right-2.5',
            props.size === 'lg' && 'right-4 sm:right-3',
          ])}
        >
          {statusIcon}
        </div>
      )}

      {/* Loading Spinner */}
      {isPending && (
        <div
          className={clsx([
            'absolute top-1/2 -translate-y-1/2',
            props.size === 'sm' && 'right-2 sm:right-1.5',
            (!props.size || props.size === 'md') && 'right-3 sm:right-2.5',
            props.size === 'lg' && 'right-4 sm:right-3',
          ])}
        >
          <LoadingSpinner
            size={props.size === 'lg' ? 'md' : 'sm'}
            className='text-zinc-500 dark:text-zinc-400'
          />
        </div>
      )}

      {/* Trailing slot (e.g., action button) */}
      {trailing ? (
        <div
          className={clsx([
            'absolute top-1/2 -translate-y-1/2 z-10',
            props.size === 'sm' && 'right-2 sm:right-1.5',
            (!props.size || props.size === 'md') && 'right-2 sm:right-2.5',
            props.size === 'lg' && 'right-3 sm:right-2.5',
          ])}
        >
          {trailing}
        </div>
      ) : null}
    </span>
  );

  // If we have label, error, or helpText, wrap in a container
  if (label || error || helpText) {
    return (
      <div className='space-y-2'>
        {label && (
          <label
            htmlFor={id}
            className='text-sm font-medium text-gray-700 dark:text-gray-300'
          >
            {label}
            {props.required && (
              <span className='text-red-500 ml-1' aria-hidden='true'>
                *
              </span>
            )}
            {props.required && <span className='sr-only'>(required)</span>}
          </label>
        )}

        {helpText && (
          <p
            id={helpTextId}
            className='text-xs text-gray-500 dark:text-gray-400'
          >
            {helpText}
          </p>
        )}

        {inputElement}

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

  return inputElement;
});
