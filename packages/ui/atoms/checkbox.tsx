'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /**
   * @deprecated Use `checked="indeterminate"` instead.
   * Kept for backward compatibility — maps to `checked="indeterminate"` internally.
   */
  readonly indeterminate?: boolean;
}

/**
 * Checkbox component with proper accessibility and keyboard support.
 * Includes visual checked state with animated checkmark icon and
 * indeterminate state with minus icon.
 *
 * Preferred API for indeterminate: `checked="indeterminate"`
 */
const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, indeterminate, checked, ...props }, ref) => {
  // Map legacy indeterminate prop to Radix-native checked="indeterminate"
  const effectiveChecked =
    indeterminate && checked !== 'indeterminate' && !checked
      ? 'indeterminate'
      : checked;

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={effectiveChecked}
      className={cn(
        'peer relative h-4 w-4 shrink-0 cursor-pointer rounded-(--app-shell-radius-item) border border-strong bg-transparent transition-colors duration-subtle ease-subtle motion-reduce:transition-none',
        'before:absolute before:left-1/2 before:top-1/2 before:h-11 before:min-w-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
        'hover:border-default hover:bg-surface-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/55 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page',
        'disabled:cursor-not-allowed disabled:opacity-[var(--state-disabled-opacity)]',
        'data-[state=checked]:border-btn-primary data-[state=checked]:bg-btn-primary data-[state=checked]:text-btn-primary-foreground data-[state=checked]:hover:border-btn-primary data-[state=checked]:hover:bg-btn-primary',
        'data-[state=indeterminate]:border-btn-primary data-[state=indeterminate]:bg-btn-primary data-[state=indeterminate]:text-btn-primary-foreground data-[state=indeterminate]:hover:border-btn-primary data-[state=indeterminate]:hover:bg-btn-primary',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn('flex items-center justify-center text-current')}
      >
        {/* Uses effectiveChecked (prop), not internal Radix state. Safe for controlled mode. */}
        {effectiveChecked === 'indeterminate' ? (
          <Minus className='h-3 w-3 [stroke-width:2.5]' />
        ) : (
          <Check className='h-3 w-3 [stroke-width:2.5]' />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
