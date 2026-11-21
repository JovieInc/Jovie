'use client';

import { IconButton, type IconButtonProps, TooltipShortcut } from '@jovie/ui';
import * as React from 'react';
import {
  APP_CONTROL_BUTTON_CLASS,
  APP_ICON_BUTTON_CLASS,
} from '@/components/atoms/app-control-button-class';

// Re-export shared chrome so existing AppIconButton importers keep working
// until Drift T2.1 alias-delete. Canonical home: app-control-button-class.ts.
export { APP_CONTROL_BUTTON_CLASS, APP_ICON_BUTTON_CLASS };

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
    /** Container size: sm 28px (app-control default) or md 32px (JOV-5063). */
    readonly size?: 'sm' | 'md';
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
    size = 'sm',
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
      size={size}
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
