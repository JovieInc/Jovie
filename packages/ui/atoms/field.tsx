'use client';

import * as React from 'react';
import { useId } from 'react';

import { cn } from '../lib/utils';
import { Label } from './label';

/**
 * Field group that wraps form controls with label, description, and error message.
 * Automatically manages accessibility connections via aria-describedby.
 */
export interface FieldProps {
  /**
   * Label text for the field
   */
  readonly label?: React.ReactNode;
  /**
   * Help text/description shown below the control
   */
  readonly description?: React.ReactNode;
  /**
   * Error message shown in red below the control
   */
  readonly error?: React.ReactNode;
  /**
   * Whether the field is required
   */
  readonly required?: boolean;
  /**
   * Custom id for the input (auto-generated if not provided)
   */
  readonly id?: string;
  /**
   * The form control (Input, Select, Textarea, etc.)
   */
  readonly children: React.ReactElement<
    React.HTMLAttributes<HTMLElement> & { variant?: string }
  >;
  /**
   * Additional className for the container
   */
  className?: string;
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    {
      label,
      description,
      error,
      required,
      id: providedId,
      children,
      className,
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const errorId = `${id}-error`;
    const descriptionId = `${id}-description`;

    // Determine aria-describedby
    const describedByIds = [];
    if (description) describedByIds.push(descriptionId);
    if (error) describedByIds.push(errorId);
    const ariaDescribedBy =
      describedByIds.length > 0 ? describedByIds.join(' ') : undefined;

    // Determine validation state
    const isInvalid = !!error;

    // Clone the child element and inject accessibility props
    const childWithProps = React.cloneElement(children, {
      id,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': isInvalid || undefined,
      'aria-required': required || undefined,
      ...(children.props.variant === undefined &&
        isInvalid && { variant: 'error' }),
    });

    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        {label && (
          <Label htmlFor={id} required={required}>
            {label}
          </Label>
        )}

        {description && (
          <p id={descriptionId} className='text-xs text-muted-foreground'>
            {description}
          </p>
        )}

        {childWithProps}

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
);
Field.displayName = 'Field';

export { Field };
