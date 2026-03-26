'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import type { ReactNode } from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';
import { ACTION_BAR_BUTTON_CLASS, ActionBar } from './ActionBar';

export const PAGE_TOOLBAR_CONTAINER_CLASS =
  'flex flex-col gap-1 border-b border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-(--linear-app-header-padding-x) py-1 md:min-h-[36px] md:flex-row md:items-center md:justify-between';

export const PAGE_TOOLBAR_START_CLASS =
  'flex min-w-0 flex-1 items-center gap-1 md:w-auto md:flex-none';

export const PAGE_TOOLBAR_END_CLASS =
  'ml-auto flex w-full items-center justify-end gap-1 md:w-auto';

export const PAGE_TOOLBAR_END_GROUP_CLASS =
  'flex w-full flex-wrap items-center gap-1 sm:w-auto sm:flex-nowrap';

export const PAGE_TOOLBAR_META_TEXT_CLASS =
  'text-xs text-tertiary-token tabular-nums';

export const PAGE_TOOLBAR_TAB_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'h-7 rounded-[6px] border-0 bg-transparent px-2.5 text-[11.5px] font-[510] text-secondary-token hover:bg-surface-0 hover:text-primary-token [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_TAB_ACTIVE_CLASS = 'bg-surface-0 text-primary-token';

export const PAGE_TOOLBAR_ACTION_BUTTON_CLASS = cn(
  ACTION_BAR_BUTTON_CLASS,
  'h-7 rounded-[6px] border border-transparent bg-transparent px-2 text-[11.5px] font-[510] text-tertiary-token hover:border-transparent hover:bg-surface-0 hover:text-primary-token focus-visible:border-transparent focus-visible:bg-surface-0 active:border-transparent active:bg-surface-1 [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS =
  'w-7 justify-center px-0 text-tertiary-token';

export const PAGE_TOOLBAR_MENU_TRIGGER_CLASS = cn(
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  'min-w-[112px] justify-between gap-1.5 px-3 text-secondary-token'
);

export const PAGE_TOOLBAR_ACTION_ACTIVE_CLASS =
  'bg-surface-0 text-primary-token';

export const PAGE_TOOLBAR_ICON_CLASS = 'h-3.5 w-3.5';
export const PAGE_TOOLBAR_ICON_STROKE_WIDTH = 2;

interface PageToolbarProps {
  readonly start: ReactNode;
  readonly end?: ReactNode;
  readonly className?: string;
  readonly startClassName?: string;
  readonly endClassName?: string;
}

export function PageToolbar({
  start,
  end,
  className,
  startClassName,
  endClassName,
}: PageToolbarProps) {
  return (
    <div className={cn(PAGE_TOOLBAR_CONTAINER_CLASS, className)}>
      <div className={cn(PAGE_TOOLBAR_START_CLASS, startClassName)}>
        {start}
      </div>
      {end ? (
        <ActionBar className={cn(PAGE_TOOLBAR_END_CLASS, endClassName)}>
          {end}
        </ActionBar>
      ) : null}
    </div>
  );
}

interface PageToolbarTabButtonProps {
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly active?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly ariaPressed?: boolean;
}

export function PageToolbarTabButton({
  label,
  icon,
  active = false,
  onClick,
  className,
  ariaPressed,
}: PageToolbarTabButtonProps) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      onClick={onClick}
      className={cn(
        PAGE_TOOLBAR_TAB_BUTTON_CLASS,
        active && PAGE_TOOLBAR_TAB_ACTIVE_CLASS,
        className
      )}
      aria-pressed={ariaPressed ?? active}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}

interface PageToolbarActionButtonProps {
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly ariaPressed?: boolean;
  readonly ariaLabel?: string;
  readonly iconOnly?: boolean;
  readonly tooltipLabel?: string;
  readonly tooltipShortcut?: string;
}

export function PageToolbarActionButton({
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
  className,
  ariaPressed,
  ariaLabel,
  iconOnly = false,
  tooltipLabel,
  tooltipShortcut,
}: PageToolbarActionButtonProps) {
  const button = (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      onClick={onClick}
      disabled={disabled}
      className={cn(
        PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
        iconOnly && PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS,
        active && PAGE_TOOLBAR_ACTION_ACTIVE_CLASS,
        className
      )}
      aria-label={
        ariaLabel ??
        tooltipLabel ??
        (typeof label === 'string' ? label : undefined)
      }
      aria-pressed={ariaPressed ?? active}
    >
      {icon}
      <span className={cn(iconOnly && 'sr-only')}>{label}</span>
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
}
