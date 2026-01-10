'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export type KbdProps = React.HTMLAttributes<HTMLSpanElement>;

const Kbd = React.forwardRef<HTMLSpanElement, KbdProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-[var(--accents-3)] bg-surface-1 px-1.5 py-0.5 font-sans text-[10px] font-medium text-secondary-token',
        'shadow-[0_1px_0_rgba(255,255,255,0.08)] dark:bg-[var(--accents-1)] dark:border-[var(--accents-4)]',
        className
      )}
      {...props}
    />
  )
);

Kbd.displayName = 'Kbd';

export { Kbd };
