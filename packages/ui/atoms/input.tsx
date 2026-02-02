'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const inputVariants = cva(
  [
    'flex w-full rounded-md border border-default bg-surface-1 px-3 py-2',
    'text-sm ring-offset-background',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium',
    'placeholder:text-muted-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'transition-colors',
  ],
  {
    variants: {
      variant: {
        default: '',
        error: 'border-destructive focus-visible:ring-destructive',
        success: 'border-green-500 focus-visible:ring-green-500',
      },
      inputSize: {
        sm: 'h-8 px-2 py-1 text-xs',
        md: 'h-10 px-3 py-2 text-sm',
        lg: 'h-12 px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);

type ValidationState = 'valid' | 'invalid' | 'pending' | null;

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /**
   * Loading state - shows spinner
   */
  readonly loading?: boolean;
  /**
   * Status icon to display (e.g., check mark for validation)
   */
  readonly statusIcon?: React.ReactNode;
  /**
   * Trailing content (e.g., action button)
   */
  readonly trailing?: React.ReactNode;
  /**
   * Label text for the input
   */
  readonly label?: string;
  /**
   * Error message to display below the input
   */
  readonly error?: string;
  /**
   * Help text to display below the input
   */
  readonly helpText?: string;
  /**
   * Validation state for styling (overrides variant when set)
   */
  readonly validationState?: ValidationState;
  /**
   * Size variant (alias for inputSize for migration compatibility)
   */
  readonly size?: 'sm' | 'md' | 'lg';
}

/**
 * Input component with comprehensive validation, loading states, and accessibility.
 * Built on native HTML input with enhanced features for forms.
 */

// Helper function to get padding class based on inputSize
function getPaddingRight(
  inputSize: InputProps['inputSize']
): 'pr-8' | 'pr-12' | 'pr-10' {
  if (inputSize === 'sm') return 'pr-8';
  if (inputSize === 'lg') return 'pr-12';
  return 'pr-10';
}

// Helper function to get position class based on inputSize
function getRightPosition(
  inputSize: InputProps['inputSize']
): 'right-2' | 'right-3' | 'right-2.5' {
  if (inputSize === 'sm') return 'right-2';
  if (inputSize === 'lg') return 'right-3';
  return 'right-2.5';
}

// Helper function to get spinner size class based on inputSize
function getSpinnerSize(
  inputSize: InputProps['inputSize']
): 'h-3 w-3' | 'h-5 w-5' | 'h-4 w-4' {
  if (inputSize === 'sm') return 'h-3 w-3';
  if (inputSize === 'lg') return 'h-5 w-5';
  return 'h-4 w-4';
}

// Generate unique IDs for accessibility
function useInputIds(providedId?: string) {
  const uniqueId = React.useId();
  const id = providedId || `input-${uniqueId}`;
  return {
    id,
    errorId: `${id}-error`,
    helpTextId: `${id}-help`,
  };
}

// Determine validation state from props
function getValidationState({
  validationState,
  error,
  ariaInvalid,
  loading,
}: {
  validationState?: ValidationState;
  error?: string;
  ariaInvalid?: React.InputHTMLAttributes<HTMLInputElement>['aria-invalid'];
  loading?: boolean;
}) {
  const isInvalid =
    validationState === 'invalid' || Boolean(error) || ariaInvalid === 'true';
  return {
    isInvalid,
    isValid: validationState === 'valid',
    isPending: validationState === 'pending' || loading,
  };
}

// Build aria-describedby attribute
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
  const ids: string[] = [];
  if (ariaDescribedBy) ids.push(ariaDescribedBy);
  if (helpText) ids.push(helpTextId);
  if (error) ids.push(errorId);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

// Determine variant based on validation state
function getVariantFromValidation(
  variant: InputProps['variant'],
  validationState?: ValidationState,
  error?: string
): InputProps['variant'] {
  if (validationState === 'invalid' || error) return 'error';
  if (validationState === 'valid') return 'success';
  return variant;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      variant,
      inputSize,
      size,
      loading,
      statusIcon,
      trailing,
      disabled,
      label,
      error,
      helpText,
      validationState,
      'aria-invalid': ariaInvalid,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    // Support both inputSize and size props (size is alias for migration)
    const effectiveSize = inputSize ?? size;
    const { id, errorId, helpTextId } = useInputIds(props.id);
    const hasRightContent = loading || statusIcon || trailing;
    const { isInvalid, isPending } = getValidationState({
      validationState,
      error,
      ariaInvalid,
      loading,
    });
    const effectiveVariant = getVariantFromValidation(
      variant,
      validationState,
      error
    );
    const describedBy = getDescribedByIds({
      ariaDescribedBy,
      helpText,
      error,
      helpTextId,
      errorId,
    });

    const inputElement = (
      <div className='relative w-full'>
        <input
          id={id}
          type={type}
          className={cn(
            inputVariants({
              variant: effectiveVariant,
              inputSize: effectiveSize,
            }),
            hasRightContent && getPaddingRight(effectiveSize),
            className
          )}
          ref={ref}
          disabled={disabled || loading}
          aria-invalid={isInvalid || undefined}
          aria-busy={isPending || undefined}
          aria-describedby={describedBy}
          {...props}
        />

        {/* Right content container */}
        {hasRightContent && (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 flex items-center gap-1',
              getRightPosition(effectiveSize)
            )}
          >
            {/* Loading spinner - decorative since input has aria-busy */}
            {isPending && (
              <span
                className={cn(
                  'animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-t-transparent',
                  'text-muted-foreground',
                  getSpinnerSize(effectiveSize)
                )}
                aria-hidden='true'
              />
            )}

            {/* Status icon */}
            {statusIcon && !isPending && (
              <div className='text-muted-foreground'>{statusIcon}</div>
            )}

            {/* Trailing content */}
            {trailing && <div>{trailing}</div>}
          </div>
        )}
      </div>
    );

    // If we have label, error, or helpText, wrap in a container
    if (label || error || helpText) {
      return (
        <div className='space-y-1.5'>
          {label && (
            <label
              htmlFor={id}
              className='text-sm font-medium text-primary-token'
            >
              {label}
              {props.required && (
                <span className='text-destructive ml-1' aria-hidden='true'>
                  *
                </span>
              )}
              {props.required && <span className='sr-only'>(required)</span>}
            </label>
          )}

          {helpText && (
            <p id={helpTextId} className='text-xs text-tertiary-token'>
              {helpText}
            </p>
          )}

          {inputElement}

          {error && (
            <p
              id={errorId}
              className='text-sm text-destructive'
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
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };
