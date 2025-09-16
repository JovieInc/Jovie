'use client';

import { cn } from '@jovie/ui/lib/utils';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  showArrow?: boolean;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(
  (
    {
      className,
      align = 'center',
      sideOffset = 8,
      showArrow = false,
      children,
      ...props
    },
    ref
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // Base styles with Tailwind v4 tokens
          'z-50 min-w-32 overflow-hidden rounded-lg border border-subtle bg-surface-1 p-4 text-primary-token shadow-lg outline-none',
          // Focus management
          'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          // Apple-style subtle motion (respects prefers-reduced-motion)
          'transform transition-all duration-150 ease-out',
          'data-[state=open]:opacity-100 data-[state=closed]:opacity-0',
          'data-[state=open]:scale-100 data-[state=closed]:scale-95',
          'data-[state=open]:translate-y-0',
          'data-[side=bottom]:data-[state=closed]:-translate-y-1',
          'data-[side=top]:data-[state=closed]:translate-y-1',
          'data-[side=left]:data-[state=closed]:translate-x-1',
          'data-[side=right]:data-[state=closed]:-translate-x-1',
          className
        )}
        {...props}
      >
        {children}
        {showArrow && (
          <PopoverPrimitive.Arrow className='fill-surface-1 drop-shadow-sm' />
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
