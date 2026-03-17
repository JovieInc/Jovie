'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  readonly indeterminate?: boolean;
}

/**
 * Checkbox component with proper accessibility and keyboard support.
 * Includes visual checked state with animated checkmark icon.
 * Supports indeterminate state via the indeterminate prop.
 */
const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
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
        <Check className='h-3 w-3 [stroke-width:2.5]' />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
