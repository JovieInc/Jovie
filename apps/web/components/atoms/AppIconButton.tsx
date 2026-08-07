'use client';

import { IconButton, type IconButtonProps, TooltipShortcut } from '@jovie/ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

// Shared chrome for app-shell text/icon controls. Kept verbatim for the
// text-control consumers; the icon-only path is the canonical `control`
// variant on @jovie/ui IconButton (JOV-4871).
export const APP_CONTROL_BUTTON_CLASS =
  'inline-flex h-app-control-sm items-center justify-center gap-1.5 rounded-pill border border-subtle bg-surface-1 px-app-control-x text-xs font-caption tracking-[-0.012em] text-secondary-token shadow-none transition-[background-color,color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-0 hover:text-primary-token hover:shadow-none focus-visible:border-focus focus-visible:bg-surface-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/16 active:border-default active:bg-surface-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none';

export const APP_ICON_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'w-app-control-sm shrink-0 rounded-full px-0 [&_svg]:h-3.5 [&_svg]:w-3.5'
);

type AppIconButtonLabelProps =
  | { readonly ariaLabel: string; readonly 'aria-label'?: never }
  | { readonly ariaLabel?: never; readonly 'aria-label': string };

export type AppIconButtonProps = Omit<
  IconButtonProps,
  'size' | 'variant' | 'aria-label' | 'ariaLabel'
> &
  AppIconButtonLabelProps & {
    readonly children: React.ReactNode;
    readonly tooltipLabel?: string;
    readonly tooltipShortcut?: string;
  };

/**
 * AppIconButton - compat wrapper over the canonical @jovie/ui IconButton
 * (JOV-4871): `control` variant at the 28px app-control size, with optional
 * tooltip. Focus ring and 44px hit target come from the base Button.
 *
 * @coverage-via apps/web/tests/unit/components/atoms/AppIconButton.test.tsx
 */
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
    className,
    ...props
  },
  ref
) {
  const resolvedAriaLabel = ariaLabel ?? ariaLabelProp;

  const button = (
    <IconButton
      ref={ref}
      variant='control'
      size='sm'
      className={className}
      aria-label={resolvedAriaLabel}
      {...props}
    >
      {children}
    </IconButton>
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
