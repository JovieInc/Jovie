'use client';

import type { ButtonProps } from '@jovie/ui';
import * as React from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';

export type HeaderIconButtonSize = 'xs' | 'sm' | 'md';

export interface HeaderIconButtonProps
  extends Omit<ButtonProps, 'children' | 'size' | 'variant' | 'aria-label'> {
  readonly children: React.ReactNode;
  readonly ariaLabel: string;
  readonly size?: HeaderIconButtonSize;
  readonly variant?: ButtonProps['variant'];
}

export const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  HeaderIconButtonProps
>(function HeaderIconButton(
  { children, ariaLabel, size = 'md', ...props },
  ref
) {
  const SIZE_CLASS_MAP: Record<HeaderIconButtonSize, string> = {
    xs: 'h-6 w-6 rounded-[7px] [&_svg]:h-3 [&_svg]:w-3',
    sm: 'h-7 w-7 rounded-[8px] [&_svg]:h-3.5 [&_svg]:w-3.5',
    md: 'h-8 w-8 rounded-[9px] [&_svg]:h-4 [&_svg]:w-4',
  };

  return (
    <AppIconButton
      ref={ref}
      className={SIZE_CLASS_MAP[size]}
      ariaLabel={ariaLabel}
      {...props}
    >
      {children}
    </AppIconButton>
  );
});

HeaderIconButton.displayName = 'HeaderIconButton';
