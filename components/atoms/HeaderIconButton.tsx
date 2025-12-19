'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

export type HeaderIconButtonSize = 'xs' | 'sm' | 'md';

export interface HeaderIconButtonProps
  extends Omit<ButtonProps, 'children' | 'size' | 'variant'> {
  children: React.ReactNode;
  ariaLabel: string;
  size?: HeaderIconButtonSize;
  variant?: ButtonProps['variant'];
}

export const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  HeaderIconButtonProps
>(function HeaderIconButton(
  {
    children,
    ariaLabel,
    asChild = false,
    size = 'md',
    variant = 'ghost',
    className,
    ...props
  },
  ref
) {
  const sizeClassName =
    size === 'xs' ? 'h-8 w-8' : size === 'sm' ? 'h-9 w-9' : 'h-10 w-10';

  return (
    <Button
      ref={ref}
      asChild={asChild}
      variant={variant}
      size='icon'
      className={cn(
        'rounded-full p-0',
        sizeClassName,
        'focus-ring-themed focus-visible:ring-offset-(--color-bg-base)',
        className
      )}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Button>
  );
});

HeaderIconButton.displayName = 'HeaderIconButton';
