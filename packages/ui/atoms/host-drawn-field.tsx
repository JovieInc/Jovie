'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

export interface HostDrawnInputProps
  extends React.ComponentPropsWithoutRef<'input'> {
  /**
   * Keep the native control for keyboard, forms and assistive technology but
   * hide it visually (`sr-only`), because a custom surface stands in for it,
   * such as the label of a choice chip.
   */
  readonly visuallyHidden?: boolean;
}

export interface HostDrawnSelectProps
  extends React.ComponentPropsWithoutRef<'select'> {
  /**
   * Keep the native listbox for assistive technology but hide it visually
   * (`sr-only`), because custom result rows stand in for it.
   */
  readonly visuallyHidden?: boolean;
}

/**
 * A native input that paints nothing of its own. Its host draws it: a field
 * shell that owns the surface and the `focus-within` ring, or a chip label
 * that paints the selected and `:has(:focus-visible)` states. `className`
 * carries the host's own text and layout classes. Use `Input` whenever the
 * field draws its own surface.
 */
export const HostDrawnInput = React.forwardRef<
  HTMLInputElement,
  HostDrawnInputProps
>(function HostDrawnInput(
  { visuallyHidden = false, className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={
        visuallyHidden ? cn('sr-only', className) : className || undefined
      }
      {...props}
    />
  );
});

/**
 * A native select that paints nothing of its own. Its host stylesheet draws
 * it (a marketing selector class), or it stays visually hidden as the listbox
 * a custom result list mirrors. Use `NativeSelect` whenever the select draws
 * its own field surface.
 */
export const HostDrawnSelect = React.forwardRef<
  HTMLSelectElement,
  HostDrawnSelectProps
>(function HostDrawnSelect(
  { visuallyHidden = false, className, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={
        visuallyHidden ? cn('sr-only', className) : className || undefined
      }
      {...props}
    />
  );
});
