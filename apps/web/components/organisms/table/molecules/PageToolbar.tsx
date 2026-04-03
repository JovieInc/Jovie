'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import type { ComponentProps, ReactNode } from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';
import { ACTION_BAR_BUTTON_CLASS, ActionBar } from './ActionBar';

export const PAGE_TOOLBAR_CONTAINER_CLASS =
  'flex min-w-0 items-center gap-1.5 border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] bg-transparent px-app-header py-1.5 md:min-h-[40px]';

export const PAGE_TOOLBAR_START_CLASS =
  'flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const PAGE_TOOLBAR_END_CLASS =
  'ml-auto flex shrink-0 items-center justify-end gap-1';

export const PAGE_TOOLBAR_END_GROUP_CLASS =
  'flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const PAGE_TOOLBAR_META_TEXT_CLASS =
  'text-xs text-tertiary-token tabular-nums';

export const PAGE_TOOLBAR_TAB_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'h-7.5 rounded-[10px] px-2.5 text-[11.5px] font-[540] text-secondary-token [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_TAB_ACTIVE_CLASS =
  'border-default bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,white_4%)] text-primary-token shadow-[0_1px_1px_rgba(0,0,0,0.04),0_6px_12px_-10px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.03)]';

export const PAGE_TOOLBAR_ACTION_BUTTON_CLASS = cn(
  ACTION_BAR_BUTTON_CLASS,
  'h-7 rounded-full border-0 bg-transparent px-2 text-[11.5px] font-[540] text-tertiary-token shadow-none hover:border-0 hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_56%,transparent)] hover:text-primary-token hover:shadow-none focus-visible:border-0 focus-visible:bg-[color-mix(in_oklab,var(--linear-row-hover)_62%,transparent)] focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-0 active:border-0 active:bg-[color-mix(in_oklab,var(--linear-row-hover)_68%,transparent)] active:text-primary-token active:shadow-none disabled:pointer-events-none disabled:opacity-35 disabled:bg-transparent [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS =
  'w-7 justify-center px-0 text-tertiary-token';

export const PAGE_TOOLBAR_MENU_TRIGGER_CLASS = cn(
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  'min-w-[112px] justify-between gap-1.5 rounded-full px-2.5 text-secondary-token'
);

export const PAGE_TOOLBAR_ACTION_ACTIVE_CLASS =
  'border-transparent bg-transparent text-primary-token shadow-none';

export const PAGE_TOOLBAR_ICON_CLASS = 'h-3.5 w-3.5';
export const PAGE_TOOLBAR_ICON_STROKE_WIDTH = 2;

interface PageToolbarProps {
  readonly start: ReactNode;
  readonly end?: ReactNode;
  readonly className?: string;
  readonly startClassName?: string;
  readonly endClassName?: string;
  readonly topDivider?: boolean;
}

export function PageToolbar({
  start,
  end,
  className,
  startClassName,
  endClassName,
  topDivider = false,
}: PageToolbarProps) {
  return (
    <div
      data-top-divider={topDivider ? 'true' : undefined}
      className={cn(
        PAGE_TOOLBAR_CONTAINER_CLASS,
        topDivider && 'border-t border-subtle',
        className
      )}
    >
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

interface PageToolbarActionButtonProps
  extends Omit<
    ComponentProps<typeof Button>,
    'children' | 'variant' | 'size' | 'type' | 'aria-label' | 'aria-pressed'
  > {
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly active?: boolean;
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
  ...buttonProps
}: PageToolbarActionButtonProps) {
  const button = (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      onClick={onClick}
      disabled={disabled}
      {...buttonProps}
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
