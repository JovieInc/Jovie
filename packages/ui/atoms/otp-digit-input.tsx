'use client';

import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/utils';

export type OtpDigitInputVariant = 'digit' | 'autofill';

const otpDigitInputVariants = cva('', {
  variants: {
    variant: {
      // Fills its segmented box edge to edge. The box draws the surface and the
      // focus ring, so the field itself stays transparent and borderless.
      digit: [
        'absolute inset-0 h-full w-full bg-transparent text-center font-sans',
        'outline-none border-none',
        'touch-manipulation [-webkit-tap-highlight-color:transparent]',
        'disabled:cursor-not-allowed',
      ],
      // Invisible overlay across the whole row: it stays in the visual
      // viewport (opacity, not sr-only) so iOS, macOS and Android offer the
      // one-time code suggestion. 16px text keeps iOS from zooming on focus.
      autofill: [
        'absolute inset-0 w-full h-full opacity-0 cursor-text text-base',
        'z-0',
        'bg-transparent border-none outline-none',
      ],
    },
  },
  defaultVariants: { variant: 'digit' },
});

export interface OtpDigitInputProps
  extends Omit<
    React.ComponentPropsWithoutRef<'input'>,
    'type' | 'inputMode' | 'pattern'
  > {
  /**
   * `digit` is one box of a segmented one-time code; `autofill` is the
   * invisible field over the row that receives the platform code suggestion.
   */
  readonly variant?: OtpDigitInputVariant;
}

/**
 * The native field behind a segmented one-time code: numeric keyboard,
 * digits-only pattern, and the autofill overlay. It draws no surface and no
 * focus ring of its own; the box that composes it owns both and must paint
 * the focused state (it receives onFocus and onBlur). `className` carries the
 * face's text size from that box.
 */
export const OtpDigitInput = React.forwardRef<
  HTMLInputElement,
  OtpDigitInputProps
>(function OtpDigitInput(
  {
    variant = 'digit',
    className,
    autoComplete = variant === 'autofill' ? 'one-time-code' : undefined,
    tabIndex = variant === 'autofill' ? -1 : undefined,
    ...props
  },
  ref
) {
  return (
    <input
      ref={ref}
      type='text'
      inputMode='numeric'
      pattern={variant === 'digit' ? '[0-9]*' : undefined}
      autoComplete={autoComplete}
      tabIndex={tabIndex}
      className={cn(otpDigitInputVariants({ variant }), className)}
      {...props}
    />
  );
});
