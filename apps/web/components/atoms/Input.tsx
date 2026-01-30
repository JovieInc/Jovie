'use client';

import * as Headless from '@headlessui/react';
import { clsx } from 'clsx';
import React, { forwardRef, useId } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

export function InputGroup({
  children,
}: Readonly<React.ComponentPropsWithoutRef<'span'>>) {
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
type InputSize = 'sm' | 'md' | 'lg';

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

const dateInputClasses = [
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
];

const sizeVariants: Record<
  InputSize,
  {
    inputPadding: string[];
    textSize: string;
    statusPadding: string;
    trailingPadding: string;
    statusRight: string;
    spinnerRight: string;
    trailingRight: string;
    spinnerSize: React.ComponentProps<typeof LoadingSpinner>['size'];
  }
> = {
  sm: {
    inputPadding: [
      'px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1.5)-1px)] sm:px-[calc(--spacing(2)-1px)] sm:py-[calc(--spacing(1)-1px)]',
    ],
    textSize: 'text-sm/5 sm:text-xs/5',
    statusPadding: 'pr-8 sm:pr-6',
    trailingPadding: 'pr-24 sm:pr-26',
    statusRight: 'right-2 sm:right-1.5',
    spinnerRight: 'right-2 sm:right-1.5',
    trailingRight: 'right-2 sm:right-1.5',
    spinnerSize: 'sm',
  },
  md: {
    inputPadding: [
      'px-[calc(--spacing(3.5)-1px)] py-[calc(--spacing(2.5)-1px)] sm:px-[calc(--spacing(3)-1px)] sm:py-[calc(--spacing(1.5)-1px)]',
    ],
    textSize: 'text-base/6 sm:text-sm/6',
    statusPadding: 'pr-10 sm:pr-8',
    trailingPadding: 'pr-28 sm:pr-32',
    statusRight: 'right-3 sm:right-2.5',
    spinnerRight: 'right-3 sm:right-2.5',
    trailingRight: 'right-2 sm:right-2.5',
    spinnerSize: 'sm',
  },
  lg: {
    inputPadding: [
      'px-[calc(--spacing(4)-1px)] py-[calc(--spacing(3)-1px)] sm:px-[calc(--spacing(3.5)-1px)] sm:py-[calc(--spacing(2.5)-1px)]',
    ],
    textSize: 'text-lg/7 sm:text-base/6',
    statusPadding: 'pr-12 sm:pr-10',
    trailingPadding: 'pr-32 sm:pr-36',
    statusRight: 'right-4 sm:right-3',
    spinnerRight: 'right-4 sm:right-3',
    trailingRight: 'right-3 sm:right-2.5',
    spinnerSize: 'md',
  },
};

function isDateType(type?: string): type is DateType {
  return Boolean(type && dateTypes.includes(type));
}

function useInputIds(providedId?: string) {
  const uniqueId = useId();
  const id = providedId || `input-${uniqueId}`;
  return {
    id,
    errorId: `${id}-error`,
    helpTextId: `${id}-help`,
  };
}

function getValidationState({
  validationState,
  error,
  ariaInvalid,
  loading,
}: {
  validationState?: InputProps['validationState'];
  error?: string;
  ariaInvalid?: Headless.InputProps['aria-invalid'];
  loading?: boolean;
}) {
  const isInvalid =
    validationState === 'invalid' || error || ariaInvalid === 'true';
  return {
    isInvalid,
    isValid: validationState === 'valid',
    isPending: validationState === 'pending' || loading,
  };
}

function getDescribedByIds({
  ariaDescribedBy,
  helpText,
  error,
  helpTextId,
  errorId,
}: {
  ariaDescribedBy?: string;
  helpText?: string;
  error?: string;
  helpTextId: string;
  errorId: string;
}) {
  const ids = [];
  if (ariaDescribedBy) ids.push(ariaDescribedBy);
  if (helpText) ids.push(helpTextId);
  if (error) ids.push(errorId);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

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
  }: Readonly<InputProps & Partial<LegacyInputProps>>,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  const { id, errorId, helpTextId } = useInputIds(props.id);
  const { isInvalid, isValid, isPending } = getValidationState({
    validationState,
    error,
    ariaInvalid,
    loading,
  });
  const sizeVariant = sizeVariants[props.size ?? 'md'];
  const describedBy = getDescribedByIds({
    ariaDescribedBy,
    helpText,
    error,
    helpTextId,
    errorId,
  });

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
        aria-describedby={describedBy}
        {...(props as unknown as Headless.InputProps)}
        className={clsx([
          // Date classes
          isDateType(props.type) && dateInputClasses,
          // Basic layout
          'relative block w-full appearance-none rounded-lg',
          // Size variants - padding and typography
          sizeVariant.inputPadding,
          sizeVariant.textSize,
          // Typography colors
          'text-zinc-950 placeholder:text-zinc-500 dark:text-white',
          // Border - using design tokens
          'border border-subtle data-hover:border-default dark:border-subtle dark:data-hover:border-default',
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
          isPending && sizeVariant.statusPadding,
          // Status icon - add right padding for icon (size-aware)
          statusIcon && sizeVariant.statusPadding,
          // Trailing slot - add more right padding for action button (size-aware)
          trailing && sizeVariant.trailingPadding,
          inputClassName,
        ])}
      />

      {/* Status Icon (validation state) */}
      {statusIcon && !isPending && (
        <div
          className={clsx([
            'absolute top-1/2 -translate-y-1/2',
            sizeVariant.statusRight,
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
            sizeVariant.spinnerRight,
          ])}
        >
          <LoadingSpinner
            size={sizeVariant.spinnerSize}
            className='text-zinc-500 dark:text-zinc-400'
          />
        </div>
      )}

      {/* Trailing slot (e.g., action button) */}
      {trailing ? (
        <div
          className={clsx([
            'absolute top-1/2 -translate-y-1/2 z-10',
            sizeVariant.trailingRight,
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
