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
    React.HTMLAttributes<HTMLElement> & {
      variant?: string;
      required?: boolean;
    }
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
    const id = providedId ?? children.props.id ?? generatedId;
    const errorId = `${id}-error`;
    const descriptionId = `${id}-description`;
    const hasDescription =
      description !== undefined &&
      description !== null &&
      description !== false;
    const hasError =
      error !== undefined && error !== null && error !== false && error !== '';

    // Preserve descriptions already owned by the child control.
    const describedByIds =
      children.props['aria-describedby']?.split(/\s+/).filter(Boolean) ?? [];
    if (hasDescription) describedByIds.push(descriptionId);
    if (hasError) describedByIds.push(errorId);
    const ariaDescribedBy =
      describedByIds.length > 0 ? describedByIds.join(' ') : undefined;

    // Determine validation state
    // Clone the child element and inject accessibility props
    const childWithProps = React.cloneElement(children, {
      id,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': hasError || children.props['aria-invalid'] || undefined,
      'aria-required': required || children.props['aria-required'] || undefined,
      required: required || children.props.required || undefined,
      ...(children.props.variant === undefined &&
        hasError && { variant: 'error' }),
    });

    return (
      <div
        ref={ref}
        className={cn('grid gap-1.5', className)}
        data-slot='field'
        data-invalid={hasError || undefined}
        data-required={required || undefined}
      >
        {label && (
          <Label htmlFor={id} required={required}>
            {label}
          </Label>
        )}

        {childWithProps}

        {hasDescription && (
          <p id={descriptionId} className='text-xs text-tertiary-token'>
            {description}
          </p>
        )}

        {hasError && (
          <p
            id={errorId}
            className='text-xs font-medium text-destructive'
            role='alert'
            aria-live='polite'
            aria-atomic='true'
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
