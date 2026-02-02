'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const textareaVariants = cva(
  [
    'flex w-full rounded-md border border-default bg-surface-1 px-3 py-2',
    'text-sm ring-offset-background',
    'placeholder:text-muted-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'transition-colors',
    'min-h-[80px]',
  ],
  {
    variants: {
      variant: {
        default: '',
        error: 'border-destructive focus-visible:ring-destructive',
        success: 'border-green-500 focus-visible:ring-green-500',
      },
      textareaSize: {
        sm: 'px-2 py-1.5 text-xs min-h-[60px]',
        md: 'px-3 py-2 text-sm min-h-[80px]',
        lg: 'px-4 py-3 text-base min-h-[120px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      textareaSize: 'md',
    },
  }
);

type ValidationState = 'valid' | 'invalid' | 'pending' | null;

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    VariantProps<typeof textareaVariants> {
  /**
   * Whether the textarea is resizable
   * @default true
   */
  readonly resizable?: boolean;
  /**
   * Label text for the textarea
   */
  readonly label?: string;
  /**
   * Error message to display below the textarea
   */
  readonly error?: string;
  /**
   * Help text to display below the textarea
   */
  readonly helpText?: string;
  /**
   * Validation state for styling (overrides variant when set)
   */
  readonly validationState?: ValidationState;
}

// Generate unique IDs for accessibility
function useTextareaIds(providedId?: string) {
  const uniqueId = React.useId();
  const id = providedId || `textarea-${uniqueId}`;
  return {
    id,
    errorId: `${id}-error`,
    helpTextId: `${id}-help`,
  };
}

// Determine variant based on validation state
function getVariantFromValidation(
  variant: TextareaProps['variant'],
  validationState?: ValidationState,
  error?: string
): TextareaProps['variant'] {
  if (validationState === 'invalid' || error) return 'error';
  if (validationState === 'valid') return 'success';
  return variant;
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

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
      textareaSize,
      resizable = true,
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
    const { id, errorId, helpTextId } = useTextareaIds(props.id);
    const isInvalid =
      validationState === 'invalid' || Boolean(error) || ariaInvalid === 'true';
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

    const textareaElement = (
      <textarea
        id={id}
        className={cn(
          textareaVariants({ variant: effectiveVariant, textareaSize }),
          resizable ? 'resize-y' : 'resize-none',
          className
        )}
        ref={ref}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        {...props}
      />
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

          {helpText && !error && (
            <p id={helpTextId} className='text-xs text-tertiary-token'>
              {helpText}
            </p>
          )}

          {textareaElement}

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

    return textareaElement;
  }
);
Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
