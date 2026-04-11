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
        'peer h-4 w-4 shrink-0 rounded-(--linear-app-radius-item) border border-(--linear-border-strong) bg-transparent cursor-pointer transition-colors duration-fast ease-interactive',
        'hover:border-(--color-accent) hover:bg-(--linear-bg-surface-1)',
        'active:scale-95 active:transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page)',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-(--linear-btn-primary-bg) data-[state=checked]:border-(--linear-btn-primary-bg) data-[state=checked]:text-(--linear-btn-primary-fg) data-[state=checked]:hover:bg-(--linear-btn-primary-bg) data-[state=checked]:hover:border-(--linear-btn-primary-bg)',
        'data-[state=indeterminate]:bg-(--linear-btn-primary-bg) data-[state=indeterminate]:border-(--linear-btn-primary-bg) data-[state=indeterminate]:text-(--linear-btn-primary-fg) data-[state=indeterminate]:hover:bg-(--linear-btn-primary-bg) data-[state=indeterminate]:hover:border-(--linear-btn-primary-bg)',
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
