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
      'peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full',
      'border-[1.5px] transition-colors duration-normal ease-interactive',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=unchecked]:bg-surface-2 data-[state=unchecked]:border-subtle',
      'data-[state=checked]:bg-accent data-[state=checked]:border-accent',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-3 w-3 rounded-full bg-white shadow-lg ring-0',
        'transition-transform duration-normal ease-interactive',
        'data-[state=unchecked]:translate-x-0',
        'data-[state=checked]:translate-x-3'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
