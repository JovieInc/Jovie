'use client';

import { Button, type ButtonProps, TooltipShortcut } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const APP_CONTROL_BUTTON_CLASS =
  'inline-flex h-(--linear-app-control-height-sm) items-center justify-center gap-1.5 rounded-(--linear-app-control-radius) border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))] px-(--linear-app-control-padding-x) text-[12px] font-[510] tracking-[-0.012em] text-secondary-token shadow-[0_1px_1px_rgba(0,0,0,0.04),0_3px_6px_-4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,color,border-color,box-shadow] duration-150 hover:border-default hover:bg-surface-0 hover:text-primary-token hover:shadow-[0_1px_1px_rgba(0,0,0,0.05),0_6px_12px_-8px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.04)] focus-visible:outline-none focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-0 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/16 active:border-default active:bg-surface-1 active:shadow-[0_1px_1px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.04)] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none';

export const APP_ICON_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'w-(--linear-app-control-height-sm) shrink-0 rounded-full px-0 [&_svg]:h-3.5 [&_svg]:w-3.5'
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
