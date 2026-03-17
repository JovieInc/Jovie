'use client';

import { Button, type ButtonProps, TooltipShortcut } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const APP_CONTROL_BUTTON_CLASS =
  'inline-flex h-(--linear-app-control-height-sm) items-center justify-center gap-1.5 rounded-(--linear-app-control-radius) border border-subtle bg-surface-0 px-(--linear-app-control-padding-x) text-[12.5px] font-[510] tracking-[-0.01em] text-secondary-token transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-1 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 active:border-default active:bg-surface-2 disabled:pointer-events-none disabled:opacity-50';

export const APP_ICON_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'w-(--linear-app-control-height-sm) shrink-0 px-0 [&_svg]:h-3 [&_svg]:w-3'
);

type AppIconButtonLabelProps =
  | { readonly ariaLabel: string; readonly 'aria-label'?: never }
  | { readonly ariaLabel?: never; readonly 'aria-label': string };

export type AppIconButtonProps = Omit<
  ButtonProps,
  'children' | 'size' | 'aria-label'
> &
  AppIconButtonLabelProps & {
    readonly children: React.ReactNode;
    readonly tooltipLabel?: string;
    readonly tooltipShortcut?: string;
  };

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
