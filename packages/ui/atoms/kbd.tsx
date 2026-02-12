'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export interface KbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Visual variant. Use 'tooltip' when inside a tooltip for proper contrast.
   * @default 'default'
   */
  readonly variant?: 'default' | 'tooltip';
}

const Kbd = React.forwardRef<HTMLSpanElement, KbdProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-sans text-[11px] font-medium',
        variant === 'tooltip'
          ? // Tooltip variant: tokenized surface for consistent contrast
            'border border-subtle bg-surface-2 text-tertiary-token'
          : // Default variant: for use outside tooltips
            'border border-subtle bg-surface-1 text-secondary-token shadow-[0_1px_0_rgba(255,255,255,0.08)]',
        className
      )}
      {...props}
    />
  )
);

Kbd.displayName = 'Kbd';

export { Kbd };
