'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import {
  APP_CONTROL_BUTTON_CLASS,
  AppIconButton,
} from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';

export const DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'h-7 rounded-[6px] border-0 bg-transparent px-3 text-[12px] text-secondary-token hover:bg-surface-0 hover:text-primary-token [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const DASHBOARD_HEADER_ACTION_TEXT_BUTTON_ACTIVE_CLASS =
  'bg-surface-0 text-primary-token';

export const DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS =
  'border-0 bg-transparent text-tertiary-token hover:bg-surface-0 hover:text-primary-token';

export const DASHBOARD_HEADER_ACTION_ICON_BUTTON_ACTIVE_CLASS =
  'bg-surface-0 text-primary-token';

export interface DashboardHeaderActionButtonProps {
  readonly ariaLabel: string;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly icon: ReactNode;
  readonly label?: ReactNode;
  readonly iconOnly?: boolean;
  readonly hideLabelOnMobile?: boolean;
  readonly tooltipLabel?: string;
  readonly tooltipShortcut?: string;
  readonly className?: string;
}

export function DashboardHeaderActionButton({
  ariaLabel,
  pressed,
  disabled,
  onClick,
  icon,
  label,
  iconOnly = false,
  hideLabelOnMobile = false,
  tooltipLabel,
  tooltipShortcut,
  className,
}: DashboardHeaderActionButtonProps) {
  if (label && !iconOnly) {
    return (
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={pressed}
        disabled={disabled}
        className={cn(
          DASHBOARD_HEADER_ACTION_TEXT_BUTTON_CLASS,
          pressed && DASHBOARD_HEADER_ACTION_TEXT_BUTTON_ACTIVE_CLASS,
          className
        )}
      >
        {icon}
        <span className={cn(hideLabelOnMobile && 'hidden sm:inline')}>
          {label}
        </span>
      </Button>
    );
  }

  return (
    <AppIconButton
      onClick={onClick}
      ariaLabel={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
      tooltipLabel={tooltipLabel}
      tooltipShortcut={tooltipShortcut}
      className={cn(
        DASHBOARD_HEADER_ACTION_ICON_BUTTON_CLASS,
        pressed && DASHBOARD_HEADER_ACTION_ICON_BUTTON_ACTIVE_CLASS,
        className
      )}
    >
      {icon}
    </AppIconButton>
  );
}
