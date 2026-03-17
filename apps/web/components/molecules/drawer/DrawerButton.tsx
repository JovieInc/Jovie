'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

type DrawerButtonTone = 'primary' | 'secondary' | 'ghost';
type DrawerButtonSize = 'sm' | 'icon';

const TONE_CLASSNAMES: Record<DrawerButtonTone, string> = {
  primary:
    'border-(--linear-accent) bg-(--linear-accent) text-white hover:border-(--linear-accent) hover:bg-(--linear-accent-hover,rgba(91,111,255,0.92)) hover:text-white active:border-(--linear-accent) active:bg-(--linear-accent-hover,rgba(91,111,255,0.88))',
  secondary:
    'border-subtle bg-surface-0 text-secondary-token hover:border-default hover:bg-surface-1 hover:text-primary-token active:border-default active:bg-surface-2',
  ghost:
    'border-transparent bg-transparent text-secondary-token hover:bg-surface-1 hover:text-primary-token active:bg-surface-2',
};

const SIZE_CLASSNAMES: Record<DrawerButtonSize, string> = {
  sm: 'h-8 rounded-[8px] px-2.5 text-[12px]',
  icon: 'h-8 w-8 rounded-[8px] px-0 [&_svg]:h-4 [&_svg]:w-4',
};

export interface DrawerButtonProps
  extends Omit<ButtonProps, 'size' | 'variant'> {
  readonly tone?: DrawerButtonTone;
  readonly size?: DrawerButtonSize;
}

export const DRAWER_BUTTON_CLASSNAME =
  'border font-[510] tracking-[-0.01em] shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20';

export const DrawerButton = React.forwardRef<
  HTMLButtonElement,
  DrawerButtonProps
>(function DrawerButton(
  { tone = 'secondary', size = 'sm', className, ...props },
  ref
) {
  return (
    <Button
      ref={ref}
      variant={tone}
      size={size === 'icon' ? 'icon' : 'sm'}
      className={cn(
        DRAWER_BUTTON_CLASSNAME,
        TONE_CLASSNAMES[tone],
        SIZE_CLASSNAMES[size],
        className
      )}
      {...props}
    />
  );
});

DrawerButton.displayName = 'DrawerButton';
