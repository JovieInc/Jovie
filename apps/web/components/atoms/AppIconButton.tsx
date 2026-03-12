'use client';

import { Button, TooltipShortcut, type ButtonProps } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const APP_CONTROL_BUTTON_CLASS =
  'inline-flex h-[var(--linear-app-control-height-sm)] items-center justify-center gap-1.5 rounded-[var(--linear-app-control-radius)] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-[var(--linear-app-control-padding-x)] text-[12px] font-[510] tracking-[-0.01em] text-(--linear-text-secondary) transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-(--linear-border-default) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-(--linear-bg-surface-1) focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 active:bg-(--linear-bg-surface-2) disabled:pointer-events-none disabled:opacity-50';

export const APP_ICON_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'w-[var(--linear-app-control-height-sm)] shrink-0 px-0 [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export interface AppIconButtonProps
  extends Omit<ButtonProps, 'children' | 'size'> {
  readonly children: React.ReactNode;
  readonly ariaLabel?: string;
  readonly 'aria-label'?: string;
  readonly tooltipLabel?: string;
  readonly tooltipShortcut?: string;
}

export const AppIconButton = React.forwardRef<
  HTMLButtonElement,
  AppIconButtonProps
>(function AppIconButton(
  {
    children,
    ariaLabel,
    'aria-label': ariaLabelProp,
    tooltipLabel,
    tooltipShortcut,
    variant = 'ghost',
    className,
    ...props
  },
  ref
) {
  const resolvedAriaLabel = ariaLabel ?? ariaLabelProp;

  const button = (
    <Button
      ref={ref}
      variant={variant}
      size='icon'
      className={cn(APP_ICON_BUTTON_CLASS, className)}
      aria-label={resolvedAriaLabel}
      {...props}
    >
      {children}
    </Button>
  );

  if (!tooltipLabel) return button;

  return (
    <TooltipShortcut
      label={tooltipLabel}
      shortcut={tooltipShortcut}
      side='bottom'
    >
      {button}
    </TooltipShortcut>
  );
});

AppIconButton.displayName = 'AppIconButton';
