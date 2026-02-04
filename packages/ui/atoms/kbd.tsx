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
          ? // Tooltip variant: theme-aware for proper contrast
            'border border-black/15 bg-black/10 text-neutral-700 dark:border-white/20 dark:bg-white/15 dark:text-white'
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
