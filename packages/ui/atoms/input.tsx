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

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /**
   * Loading state - shows spinner
   */
  loading?: boolean;
  /**
   * Status icon to display (e.g., check mark for validation)
   */
  statusIcon?: React.ReactNode;
  /**
   * Trailing content (e.g., action button)
   */
  trailing?: React.ReactNode;
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

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      variant,
      inputSize,
      loading,
      statusIcon,
      trailing,
      disabled,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => {
    const hasRightContent = loading || statusIcon || trailing;
    const isInvalid = variant === 'error' || ariaInvalid === 'true';

    return (
      <div className='relative w-full'>
        <input
          type={type}
          className={cn(
            inputVariants({ variant, inputSize }),
            hasRightContent && getPaddingRight(inputSize),
            className
          )}
          ref={ref}
          disabled={disabled || loading}
          aria-invalid={isInvalid || undefined}
          aria-busy={loading || undefined}
          {...props}
        />

        {/* Right content container */}
        {hasRightContent && (
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 flex items-center gap-1',
              getRightPosition(inputSize)
            )}
          >
            {/* Loading spinner */}
            {loading && (
              // biome-ignore lint/a11y/useAriaPropsSupportedByRole: ARIA label needed for loading spinner accessibility
              <div
                className={cn(
                  'animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-t-transparent',
                  'text-muted-foreground',
                  getSpinnerSize(inputSize)
                )}
                aria-label='Loading'
              />
            )}

            {/* Status icon */}
            {statusIcon && !loading && (
              <div className='text-muted-foreground'>{statusIcon}</div>
            )}

            {/* Trailing content */}
            {trailing && <div>{trailing}</div>}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };
