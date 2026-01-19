'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export interface KbdProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Visual variant. Use 'tooltip' when inside a tooltip for proper contrast.
   * @default 'default'
   */
  variant?: 'default' | 'tooltip';
}

const Kbd = React.forwardRef<HTMLSpanElement, KbdProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-[5px] px-1.5 py-0.5 font-sans text-[11px] font-medium',
        variant === 'tooltip'
          ? // Tooltip variant: solid badge for contrast on dark tooltip (Linear-style)
            'border border-white/20 bg-white/15 text-white'
          : // Default variant: for use outside tooltips
            'border border-[var(--accents-3)] bg-surface-1 text-secondary-token shadow-[0_1px_0_rgba(255,255,255,0.08)] dark:bg-[var(--accents-1)] dark:border-[var(--accents-4)]',
        className
      )}
      {...props}
    />
  )
);

Kbd.displayName = 'Kbd';

export { Kbd };
