'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const textareaVariants = cva(
  [
    'flex w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2',
    'text-app font-normal tracking-normal text-primary-token',
    'placeholder:text-tertiary-token',
    'hover:border-default',
    'focus-visible:outline-none focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25',
    'disabled:cursor-not-allowed disabled:opacity-[var(--state-disabled-opacity)]',
    'transition-[background-color,border-color,box-shadow,color,opacity] duration-subtle ease-subtle motion-reduce:transition-none',
    'min-h-20',
  ],
  {
    variants: {
      variant: {
        default: '',
        error:
          'border-error hover:border-error focus-visible:border-error focus-visible:ring-error/25',
        success:
          'border-success hover:border-success focus-visible:border-success focus-visible:ring-success/25',
      },
      textareaSize: {
        sm: 'px-2 py-1.5 text-xs min-h-15',
        md: 'px-3 py-2 text-app min-h-20',
        lg: 'px-3.5 py-3 text-app min-h-30',
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
      'aria-busy': ariaBusy,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const { id, errorId, helpTextId } = useTextareaIds(props.id);
    const isInvalid =
      validationState === 'invalid' ||
      Boolean(error) ||
      ariaInvalid === true ||
      ariaInvalid === 'true' ||
      ariaInvalid === 'grammar' ||
      ariaInvalid === 'spelling';
    const isPending = validationState === 'pending';
    const effectiveVariant = isInvalid
      ? 'error'
      : getVariantFromValidation(variant, validationState, error);
    const effectiveAriaInvalid =
      ariaInvalid === 'grammar' || ariaInvalid === 'spelling'
        ? ariaInvalid
        : isInvalid || undefined;
    const effectiveAriaBusy = isPending ? true : ariaBusy;
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
        aria-invalid={effectiveAriaInvalid}
        aria-busy={effectiveAriaBusy}
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

          {helpText && (
            <p id={helpTextId} className='text-xs text-tertiary-token'>
              {helpText}
            </p>
          )}

          {textareaElement}

          <div className='min-h-5' aria-live='polite'>
            {error && (
              <p id={errorId} className='text-sm text-destructive' role='alert'>
                {error}
              </p>
            )}
          </div>
        </div>
      );
    }

    return textareaElement;
  }
);
Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
