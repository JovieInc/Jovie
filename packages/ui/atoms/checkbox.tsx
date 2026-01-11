'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  indeterminate?: boolean;
}

/**
 * Checkbox component with proper accessibility and keyboard support.
 * Includes visual checked state with animated checkmark icon.
 * Supports indeterminate state via the indeterminate prop.
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, indeterminate, ...props }, ref) => {
  const internalRef = React.useRef<HTMLButtonElement>(null);

  // Merge refs to support both callback refs and object refs
  const mergedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      // Update internal ref
      (
        internalRef as React.MutableRefObject<HTMLButtonElement | null>
      ).current = node;

      // Forward to external ref (supports both callback and object refs)
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current =
          node;
      }
    },
    [ref]
  );

  React.useEffect(() => {
    if (internalRef.current) {
      const element = internalRef.current as HTMLButtonElement & {
        indeterminate?: boolean;
      };
      element.indeterminate = indeterminate ?? false;
    }
  }, [indeterminate]);

  return (
    <CheckboxPrimitive.Root
      ref={mergedRef}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn('flex items-center justify-center text-current')}
      >
        <Check className='h-4 w-4' />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
