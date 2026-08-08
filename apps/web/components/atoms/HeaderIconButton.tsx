'use client';

import { IconButton, type IconButtonProps } from '@jovie/ui';
import * as React from 'react';

export type HeaderIconButtonSize = 'xs' | 'sm' | 'md';

export interface HeaderIconButtonProps
  extends Omit<
    IconButtonProps,
    'children' | 'size' | 'variant' | 'aria-label' | 'ariaLabel'
  > {
  readonly children: React.ReactNode;
  readonly ariaLabel: string;
  readonly size?: HeaderIconButtonSize;
}

/**
 * HeaderIconButton - compat wrapper over the canonical @jovie/ui IconButton
 * (JOV-4871): `control` variant at compact header sizes (24/28/32px), with
 * the base Button 44px hit target preserved.
 *
 * @coverage-via apps/web/tests/unit/atoms/HeaderIconButton.test.tsx
 */
export const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  HeaderIconButtonProps
>(function HeaderIconButton(
  { children, ariaLabel, size = 'md', className, ...props },
  ref
) {
  return (
    <IconButton
      ref={ref}
      variant='control'
      size={size}
      className={className}
      ariaLabel={ariaLabel}
      {...props}
    >
      {children}
    </IconButton>
  );
});

HeaderIconButton.displayName = 'HeaderIconButton';
