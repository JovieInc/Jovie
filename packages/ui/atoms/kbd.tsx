'use client';

import { ArrowBigUp } from 'lucide-react';
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
  ({ className, variant = 'default', children, ...props }, ref) => {
    // The text glyph is retained for the accessibility tree while the visible
    // mark uses the existing icon system. This keeps Shift legible at the
    // compact keycap size without introducing a bespoke glyph asset.
    const isShiftGlyph =
      typeof children === 'string' && children.trim() === '⇧';

    return (
      <kbd
        ref={ref}
        data-slot='kbd'
        data-variant={variant}
        data-key={isShiftGlyph ? 'shift' : undefined}
        className={cn(
          'inline-flex min-h-6 min-w-6 max-w-full items-center justify-center rounded-(--app-shell-radius-item) border border-(--linear-border-default) px-2 py-0.5 text-center font-sans text-xs leading-4 tracking-tight font-medium shadow-sm',
          variant === 'tooltip'
            ? // Tooltip variant: the existing 8px radius token matches the
              // canonical overlay's 16px radius after its 8px `space-2` inset.
              // Use the tooltip foreground token for the key edge so the
              // inverted light tooltip does not pair a black border with a
              // black surface. The 20% alpha keeps the edge restrained in
              // both themes without introducing a new palette token.
              'rounded-(--radius-sm) border-(--color-text-tooltip)/20 bg-surface-tooltip text-tooltip-foreground'
            : // Default variant: for use outside tooltips
              'bg-(--linear-bg-surface-1) text-(--linear-text-secondary)',
          className
        )}
        {...props}
      >
        {isShiftGlyph ? (
          <>
            <span className='sr-only'>Shift</span>
            <ArrowBigUp
              aria-hidden='true'
              data-kbd-shift-icon='true'
              className='h-3 w-3 shrink-0'
              strokeWidth={1.75}
            />
          </>
        ) : (
          children
        )}
      </kbd>
    );
  }
);

Kbd.displayName = 'Kbd';

export { Kbd };
