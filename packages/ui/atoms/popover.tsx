'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { popoverContentClasses } from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  readonly showArrow?: boolean;
  readonly portalProps?: React.ComponentPropsWithoutRef<
    typeof PopoverPrimitive.Portal
  >;
  readonly disablePortal?: boolean;
  /**
   * Test ID for the popover content.
   * @default "popover-content"
   */
  readonly testId?: string;
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
      portalProps,
      disablePortal = false,
      testId = 'popover-content',
      ...props
    },
    ref
  ) => {
    const content = (
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(popoverContentClasses, className)}
        data-testid={testId}
        {...props}
      >
        {children}
        {showArrow && (
          <PopoverPrimitive.Arrow
            className='fill-surface-1 drop-shadow-sm'
            data-testid='popover-arrow'
          />
        )}
      </PopoverPrimitive.Content>
    );

    if (disablePortal) {
      return content;
    }

    return (
      <PopoverPrimitive.Portal {...portalProps}>
        {content}
      </PopoverPrimitive.Portal>
    );
  }
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
