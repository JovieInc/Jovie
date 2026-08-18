'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

const labelVariants = cva(
  'inline-flex cursor-pointer items-center text-[13px] font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-[var(--state-disabled-opacity)]',
  {
    variants: {
      variant: {
        default: 'text-primary-token',
        muted: 'text-tertiary-token',
        error: 'text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {
  /**
   * Whether the field is required. Adds a visual indicator.
   */
  readonly required?: boolean;
}

/**
 * Label component with accessibility and theming support.
 * Automatically associates with form controls via htmlFor prop.
 */
const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, variant, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    data-required={required ? 'true' : 'false'}
    data-variant={variant ?? 'default'}
    className={cn(labelVariants({ variant }), className)}
    {...props}
  >
    {children}
    {required && (
      <>
        <span className='ml-1 text-destructive' aria-hidden='true'>
          *
        </span>
        <span className='sr-only'>(required)</span>
      </>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants };
