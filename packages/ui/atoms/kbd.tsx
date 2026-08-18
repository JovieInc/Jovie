'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Visual variant. Use 'tooltip' when inside a tooltip for proper contrast.
   * @default 'default'
   */
  readonly variant?: 'default' | 'tooltip';
}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <kbd
      ref={ref}
      data-slot='kbd'
      data-variant={variant}
      className={cn(
        'inline-flex min-h-5 min-w-5 items-center justify-center rounded-(--linear-app-radius-item) px-1.5 py-px text-center font-mono text-[11px] leading-none font-[510] shadow-sm',
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
