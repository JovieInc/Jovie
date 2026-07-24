'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ACTION_BAR_BUTTON_CLASS, ActionBar } from './ActionBar';

export const PAGE_TOOLBAR_CONTAINER_CLASS =
  'flex min-h-10 min-w-0 items-center gap-1.5 bg-transparent px-app-header py-1.5';

export const PAGE_TOOLBAR_START_CLASS =
  'flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const PAGE_TOOLBAR_END_CLASS =
  'ml-auto flex shrink-0 items-center justify-end gap-1';

export const PAGE_TOOLBAR_END_GROUP_CLASS =
  'flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const PAGE_TOOLBAR_META_TEXT_CLASS =
  'text-xs text-tertiary-token tabular-nums';

export const PAGE_TOOLBAR_TAB_BUTTON_CLASS =
  'inline-flex h-7.5 items-center justify-center gap-1.5 rounded-pill bg-transparent px-2.5 text-2xs font-caption font-[540] tracking-tight text-secondary-token shadow-none transition-[background-color,color,box-shadow] duration-subtle hover:bg-surface-0 hover:text-primary-token focus-visible:bg-surface-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/16 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5';

export const PAGE_TOOLBAR_TAB_ACTIVE_CLASS =
  'ring-2 ring-(--color-accent) text-primary-token';

export const PAGE_TOOLBAR_ACTION_BUTTON_CLASS = cn(
  ACTION_BAR_BUTTON_CLASS,
  'h-7 rounded-full border-0 bg-transparent px-2 text-2xs font-[540] text-tertiary-token shadow-none hover:border-0 hover:bg-(--linear-row-hover) hover:text-primary-token hover:shadow-none focus-visible:border-0 focus-visible:bg-(--linear-row-hover) focus-visible:text-primary-token focus-visible:outline-none focus-visible:ring-0 active:border-0 active:bg-(--linear-row-hover) active:text-primary-token active:shadow-none disabled:pointer-events-none disabled:bg-transparent disabled:opacity-35 [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS =
  'w-7 justify-center px-0 text-tertiary-token';

export const TABLE_TOOLBAR_SHELL_CLASS =
  'flex h-11 min-h-11 min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-(--app-shell-frame-seam) bg-(--app-shell-content-surface) px-3.5 py-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const TABLE_TOOLBAR_OVERLAY_CLASS = cn(
  'absolute inset-x-0 top-0 z-10',
  TABLE_TOOLBAR_SHELL_CLASS
);

export const TABLE_TOOLBAR_LEFT_CLASS = 'flex shrink-0 items-center gap-2';

export const TABLE_TOOLBAR_RIGHT_CLASS =
  'ml-auto flex shrink-0 items-center gap-2';

export const TABLE_TOOLBAR_MENU_BUTTON_CLASS = cn(
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  'min-w-22 justify-center text-secondary-token'
);

export const PAGE_TOOLBAR_MENU_TRIGGER_CLASS = cn(
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  'min-w-28 justify-between gap-1.5 rounded-full px-2.5 text-secondary-token'
);

export const PAGE_TOOLBAR_ACTION_ACTIVE_CLASS =
  'border-transparent bg-transparent text-primary-token shadow-none';

export const PAGE_TOOLBAR_ICON_CLASS = 'h-3.5 w-3.5';
export const PAGE_TOOLBAR_ICON_STROKE_WIDTH = 2;

export interface TableToolbarBulkAction {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant?: 'default' | 'destructive';
}

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
