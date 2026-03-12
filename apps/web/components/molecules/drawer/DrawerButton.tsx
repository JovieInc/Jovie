'use client';

import { Button, type ButtonProps } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

type DrawerButtonTone = 'secondary' | 'ghost';
type DrawerButtonSize = 'sm' | 'icon';

const TONE_CLASSNAMES: Record<DrawerButtonTone, string> = {
  secondary:
    'border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-text-secondary) hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) active:border-(--linear-border-default) active:bg-(--linear-bg-surface-2)',
  ghost:
    'border-transparent bg-transparent text-(--linear-text-secondary) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) active:bg-(--linear-bg-surface-2)',
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
      variant={tone === 'ghost' ? 'ghost' : 'secondary'}
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
