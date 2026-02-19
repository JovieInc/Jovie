'use client';

import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * Switch component (toggle switch) with proper accessibility.
 * Supports keyboard navigation, disabled state, and smooth animations.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
      'border-2 transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-white/40 dark:focus-visible:ring-offset-gray-900',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=unchecked]:bg-gray-200 data-[state=unchecked]:border-gray-300',
      'dark:data-[state=unchecked]:bg-gray-600 dark:data-[state=unchecked]:border-gray-500',
      'data-[state=checked]:bg-[var(--color-accent)] data-[state=checked]:border-[var(--color-accent)]',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0',
        'transition-transform',
        'data-[state=unchecked]:translate-x-0',
        'data-[state=checked]:translate-x-4'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
