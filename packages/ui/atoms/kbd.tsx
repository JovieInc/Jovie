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
  /**
   * Keycap size. 'sm' is the quiet 16px chip for menu-row hints, where the
   * shortcut is secondary to the row's label.
   * @default 'default'
   */
  readonly size?: 'default' | 'sm';
}

// Modifier glyphs are read as raw symbols (or skipped) by screen readers, so
// a keycap that shows one also carries the spoken key names.
const MODIFIER_NAMES: Readonly<Record<string, string>> = {
  '⌘': 'Command',
  '⌥': 'Option',
  '⌃': 'Control',
  '⇧': 'Shift',
};

function spokenKeyNames(children: React.ReactNode): string | null {
  if (typeof children !== 'string' || !/[⌘⌥⌃⇧]/.test(children)) return null;
  return children
    .replace(/[⌘⌥⌃⇧]/g, glyph => ` ${MODIFIER_NAMES[glyph]} `)
    .replace(/\s+/g, ' ')
    .trim();
}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  (
    { className, variant = 'default', size = 'default', children, ...props },
    ref
  ) => {
    // The text glyph is retained for the accessibility tree while the visible
    // mark uses the existing icon system. This keeps Shift legible at the
    // compact keycap size without introducing a bespoke glyph asset.
    const isShiftGlyph =
      typeof children === 'string' && children.trim() === '⇧';
    const spoken = isShiftGlyph ? null : spokenKeyNames(children);

    return (
      <kbd
        ref={ref}
        data-slot='kbd'
        data-variant={variant}
        data-size={size}
        data-key={isShiftGlyph ? 'shift' : undefined}
        className={cn(
          'inline-flex max-w-full items-center justify-center border text-center font-sans tracking-tight font-medium',
          size === 'sm'
            ? 'min-h-4 min-w-4 rounded-(--radius-default) border-subtle px-1 text-3xs leading-3'
            : 'min-h-6 min-w-6 rounded-(--app-shell-radius-item) border-(--linear-border-default) px-2 py-0.5 text-xs leading-4 shadow-sm',
          variant === 'tooltip'
            ? // Tooltip variant: the existing 8px radius token matches the
              // canonical overlay's 16px radius after its 8px `space-2` inset.
              'rounded-(--radius-sm) border-strong bg-surface-tooltip text-tooltip-foreground'
            : size === 'sm'
              ? // Small chips stay quiet: no fill, muted glyphs.
                'bg-transparent text-tertiary-token'
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
              className={cn(
                'shrink-0',
                size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
              )}
              strokeWidth={1.75}
            />
          </>
        ) : spoken ? (
          <>
            <span aria-hidden='true'>{children}</span>
            <span className='sr-only'>{spoken}</span>
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
