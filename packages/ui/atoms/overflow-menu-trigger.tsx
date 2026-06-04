'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import {
  MENU_OVERFLOW_TRIGGER_BASE,
  MENU_OVERFLOW_TRIGGER_DRAWER,
  MENU_OVERFLOW_TRIGGER_SEGMENT,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

const overflowTriggerVariants = cva(MENU_OVERFLOW_TRIGGER_BASE, {
  variants: {
    variant: {
      drawer: MENU_OVERFLOW_TRIGGER_DRAWER,
      segment: MENU_OVERFLOW_TRIGGER_SEGMENT,
    },
  },
  defaultVariants: {
    variant: 'drawer',
  },
});

export interface OverflowMenuTriggerProps
  extends VariantProps<typeof overflowTriggerVariants> {
  /** Whether the active tab is hidden in the overflow menu */
  readonly hasActiveOverflow: boolean;
  readonly className?: string;
}

/**
 * Pill-shaped "More" button for tab overflow menus.
 * Shows a dot indicator when the active tab is in the overflow menu.
 */
export const OverflowMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  OverflowMenuTriggerProps & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ hasActiveOverflow, variant, className, ...props }, ref) => (
  <button
    ref={ref}
    type='button'
    aria-label='More tabs'
    className={cn(overflowTriggerVariants({ variant }), className)}
    {...props}
  >
    <MoreHorizontal className='h-3.5 w-3.5' />
    {hasActiveOverflow ? (
      <span
        className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent'
        aria-hidden='true'
      />
    ) : null}
  </button>
));
OverflowMenuTrigger.displayName = 'OverflowMenuTrigger';
