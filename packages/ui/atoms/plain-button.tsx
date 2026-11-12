'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Keyboard focus ring PlainButton adds when the caller brings no focus
 * styling of its own. Same tokens as Button's ring.
 */
export const plainButtonFocusClassName =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page';

// A caller that already styles focus keeps exactly its own treatment, so
// moving a raw <button> onto PlainButton never changes how it looks.
const CALLER_FOCUS_STYLING = /(^|\s)(focus(-visible|-within)?:|focus-ring)/;

export interface PlainButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * The design system's headless button: a native `<button>` that carries only
 * the behaviour every button shares (a default `type="button"`, a keyboard
 * focus ring and a `data-disabled` hook) and no visual treatment.
 *
 * Use `Button` for anything that should look like a button. PlainButton is for
 * pressable surfaces whose look is owned by their component (rows, tiles,
 * chips, segmented options) where Button's pill shape and minimum height
 * would change the design. Pass `type="submit"` explicitly inside a form.
 */
export const PlainButton = React.forwardRef<
  HTMLButtonElement,
  PlainButtonProps
>(function PlainButton(
  { type = 'button', className, disabled, ...props },
  ref
) {
  // Nothing here is worth caching: the compiler's memo slots would cost more
  // bytes on every page than the one className join they save.
  'use no memo';
  const ownsFocus =
    typeof className === 'string' && CALLER_FOCUS_STYLING.test(className);
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      data-slot='plain-button'
      data-disabled={disabled ? '' : undefined}
      className={cn(!ownsFocus && plainButtonFocusClassName, className)}
      {...props}
    />
  );
});
