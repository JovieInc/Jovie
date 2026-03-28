'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

const overflowTriggerVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center rounded-full border bg-transparent transition-[background-color,color,border-color] duration-150',
    'hover:border-default hover:bg-surface-0 hover:text-primary-token',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/30 focus-visible:ring-offset-1',
    'text-tertiary-token',
  ],
  {
    variants: {
      variant: {
        drawer:
          'min-h-7 border-subtle px-2 text-[11.5px] font-[510] tracking-[-0.01em]',
        segment:
          'h-7 border-subtle px-2 text-[12px] font-[510] tracking-[-0.01em]',
      },
    },
    defaultVariants: {
      variant: 'drawer',
    },
  }
);

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
