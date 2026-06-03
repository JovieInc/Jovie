'use client';

import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * System B switch component.
 * 28×16px track, 12×12px thumb, tokenized 150ms state transition.
 * Supports keyboard navigation, disabled state, and focus ring.
 */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full px-0.5',
      'transition-colors duration-fast ease-interactive',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=unchecked]:bg-surface-2 data-[state=unchecked]:hover:bg-surface-3 disabled:data-[state=unchecked]:hover:bg-surface-2',
      'data-[state=checked]:bg-btn-primary data-[state=checked]:hover:bg-btn-primary-hover disabled:data-[state=checked]:hover:bg-btn-primary',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-3 w-3 rounded-full bg-btn-primary-foreground shadow-sm ring-0',
        'transition-[margin] duration-fast ease-interactive',
        'data-[state=checked]:ml-3'
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
