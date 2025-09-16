'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className='z-50 rounded-lg border border-subtle bg-surface-1 p-4 text-primary-token shadow-md outline-none'
    {...props}
  />
));
PopoverContent.displayName = 'PopoverContent';
