'use client';

import {
  type ButtonProps,
  IconButton,
  type IconButtonSize,
  type IconButtonVariant,
} from '@jovie/ui';
import * as React from 'react';

/**
 * CircleIconButton - compat wrapper over the canonical @jovie/ui IconButton
 * (JOV-4871). Keeps the legacy prop API; the size/variant contract, focus
 * ring, reduced-motion, and 44px hit target now live in one place.
 *
 * @coverage-via apps/web/tests/unit/atoms/CircleIconButton.test.tsx
 *
 * @example
 * // Surface variant (default) - elevated card style
 * <CircleIconButton ariaLabel="Back" onClick={goBack}>
 *   <ArrowLeft className="h-4 w-4" />
 * </CircleIconButton>
 *
 * @example
 * // As a link using asChild
 * <CircleIconButton asChild ariaLabel="Back to profile">
 *   <Link href="/profile"><ArrowLeft /></Link>
 * </CircleIconButton>
 */

export type CircleIconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
export type CircleIconButtonVariant = Exclude<
  IconButtonVariant,
  'control' | 'inline'
>;

export interface CircleIconButtonProps
  extends Omit<ButtonProps, 'size' | 'variant' | 'aria-label'> {
  /** Accessible label for screen readers */
  readonly ariaLabel: string;
  /** Button size - xs/sm/md: 40px, lg: 44px */
  readonly size?: CircleIconButtonSize;
  /** Visual variant */
  readonly variant?: CircleIconButtonVariant;
}

// Legacy circle sizes collapse onto the canonical contract: xs/sm/md all
// rendered 40px, lg rendered 44px.
const SIZE_MAP: Record<CircleIconButtonSize, IconButtonSize> = {
  xs: 'lg',
  sm: 'lg',
  md: 'lg',
  lg: 'xl',
};

export const CircleIconButton = React.forwardRef<
  HTMLButtonElement,
  CircleIconButtonProps
>(function CircleIconButton(
  {
    ariaLabel,
    size = 'sm',
    variant = 'surface',
    type = 'button',
    asChild,
    ...props
  },
  ref
) {
  return (
    <IconButton
      ref={ref}
      asChild={asChild}
      type={asChild ? undefined : type}
      variant={variant}
      size={SIZE_MAP[size]}
      ariaLabel={ariaLabel}
      {...props}
    />
  );
});

CircleIconButton.displayName = 'CircleIconButton';
