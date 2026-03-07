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
        'inline-flex min-w-[16px] items-center justify-center rounded-(--linear-app-radius-item) px-1 py-px font-mono text-[11px] leading-none font-[450] text-center',
        variant === 'tooltip'
          ? // Tooltip variant: elevated surface visible against tooltip bg
            'border border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-primary)'
          : // Default variant: for use outside tooltips
            'border border-(--linear-border-default) bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
        className
      )}
      {...props}
    />
  )
);

Kbd.displayName = 'Kbd';

export { Kbd };
