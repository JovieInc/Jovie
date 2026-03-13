'use client';

import { Button, TooltipShortcut } from '@jovie/ui';
import type { ReactNode } from 'react';
import { APP_CONTROL_BUTTON_CLASS } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';
import { ACTION_BAR_BUTTON_CLASS, ActionBar } from './ActionBar';

export const PAGE_TOOLBAR_CONTAINER_CLASS =
  'flex flex-col gap-0.5 border-b border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-3 py-1 md:min-h-[40px] md:flex-row md:items-center md:justify-between md:px-[var(--linear-app-header-padding-x)] md:py-0.5';

export const PAGE_TOOLBAR_START_CLASS =
  'flex min-w-0 flex-1 items-center gap-1 md:w-auto md:flex-none';

export const PAGE_TOOLBAR_END_CLASS =
  'ml-auto flex w-full items-center justify-end gap-0.5 md:w-auto';

export const PAGE_TOOLBAR_META_TEXT_CLASS =
  'text-xs text-(--linear-text-tertiary) tabular-nums';

export const PAGE_TOOLBAR_TAB_BUTTON_CLASS = cn(
  APP_CONTROL_BUTTON_CLASS,
  'h-8 rounded-[7px] border-(--linear-border-subtle) bg-transparent px-3 text-[12.5px] font-[510] text-(--linear-text-secondary) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_TAB_ACTIVE_CLASS =
  'border-(--linear-border-subtle) bg-(--linear-bg-surface-1) text-(--linear-text-primary)';

export const PAGE_TOOLBAR_ACTION_BUTTON_CLASS = cn(
  ACTION_BAR_BUTTON_CLASS,
  'h-8 rounded-[6px] border border-transparent bg-transparent px-2 text-[12.5px] font-[510] text-(--linear-text-tertiary) hover:border-transparent hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-primary) focus-visible:border-transparent focus-visible:bg-(--linear-bg-surface-1) active:border-transparent active:bg-(--linear-bg-surface-1) [&_svg]:h-3.5 [&_svg]:w-3.5'
);

export const PAGE_TOOLBAR_ACTION_ICON_ONLY_BUTTON_CLASS =
  'w-8 justify-center px-0 text-(--linear-text-tertiary)';

export const PAGE_TOOLBAR_ACTION_ACTIVE_CLASS =
  'border-transparent bg-(--linear-bg-surface-1) text-(--linear-text-primary)';

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
