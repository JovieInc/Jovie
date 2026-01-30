'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import * as React from 'react';

import { cn } from '@/lib/utils';

export type HeaderIconButtonSize = 'xs' | 'sm' | 'md';

export interface HeaderIconButtonProps
  extends Omit<ButtonProps, 'children' | 'size' | 'variant'> {
  readonly children: React.ReactNode;
  readonly ariaLabel: string;
  readonly size?: HeaderIconButtonSize;
  readonly variant?: ButtonProps['variant'];
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
  const SIZE_CLASS_MAP: Record<HeaderIconButtonSize, string> = {
    xs: 'p-1',
    sm: 'p-1.5',
    md: 'p-2',
  };
  const sizeClassName = SIZE_CLASS_MAP[size];

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
