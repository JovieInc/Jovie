import { ChevronRight } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn, rowState } from '../table.styles';

export type ShellListRowChrome = 'plain' | 'shell';
export type ShellListRowDensity =
  | 'none'
  | 'compact'
  | 'dense'
  | 'standard'
  | 'spacious';
export type ShellListRowInteraction = 'self' | 'task-row-group' | 'none';

export interface ShellListRowFrameProps
  extends ComponentPropsWithoutRef<'div'> {
  readonly chrome?: ShellListRowChrome;
  readonly density?: ShellListRowDensity;
  readonly isSelected?: boolean;
  readonly interaction?: ShellListRowInteraction;
  readonly interactive?: boolean;
}

export interface ShellListRowButtonProps
  extends ComponentPropsWithoutRef<'button'> {
  readonly chrome?: ShellListRowChrome;
  readonly density?: ShellListRowDensity;
  readonly isSelected?: boolean;
  readonly interaction?: ShellListRowInteraction;
  readonly interactive?: boolean;
}

export interface ShellListRowDisclosureIconProps
  extends ComponentPropsWithoutRef<typeof ChevronRight> {
  readonly open?: boolean;
}

const shellListRowDensityClassName = {
  none: '',
  compact: 'min-h-7 py-0.5',
  dense: 'min-h-8 py-1',
  standard: 'min-h-11 py-1.5',
  spacious: 'h-14',
} as const satisfies Record<ShellListRowDensity, string>;

function getTaskRowGroupState(isSelected: boolean): string {
  if (isSelected) {
    return 'system-b-shell-list-task-row-selected';
  }

  return 'system-b-shell-list-task-row-hover';
}

export function getShellListRowFrameClassName({
  chrome = 'plain',
  className,
  density = 'none',
  interaction = 'self',
  interactive = false,
  isSelected = false,
}: Readonly<{
  chrome?: ShellListRowChrome;
  className?: string;
  density?: ShellListRowDensity;
  interaction?: ShellListRowInteraction;
  interactive?: boolean;
  isSelected?: boolean;
}>) {
  const interactionClassName =
    interaction === 'self'
      ? cn(
          rowState.focusVisible,
          isSelected ? rowState.selected : rowState.hover
        )
      : interaction === 'task-row-group'
        ? getTaskRowGroupState(isSelected)
        : '';

  return cn(
    'relative min-w-0 rounded-md border border-transparent outline-none',
    rowState.base,
    chrome === 'shell' && 'system-b-table-row-shell',
    shellListRowDensityClassName[density],
    interactive && 'cursor-pointer',
    interactionClassName,
    className
  );
}

export function ShellListRowFrame({
  chrome = 'plain',
  className,
  density = 'none',
  interaction = 'self',
  interactive = false,
  isSelected = false,
  ...props
}: Readonly<ShellListRowFrameProps>) {
  return (
    <div
      data-shell-list-row='true'
      data-selected={isSelected ? 'true' : undefined}
      className={getShellListRowFrameClassName({
        chrome,
        className,
        density,
        interaction,
        interactive,
        isSelected,
      })}
      {...props}
    />
  );
}

export function ShellListRowButton({
  chrome = 'plain',
  className,
  density = 'none',
  interaction = 'self',
  interactive = true,
  isSelected = false,
  type = 'button',
  ...props
}: Readonly<ShellListRowButtonProps>) {
  return (
    <button
      type={type}
      data-shell-list-row='true'
      data-selected={isSelected ? 'true' : undefined}
      className={getShellListRowFrameClassName({
        chrome,
        className,
        density,
        interaction,
        interactive,
        isSelected,
      })}
      {...props}
    />
  );
}

export function ShellListRowDisclosureIcon({
  className,
  open = false,
  ...props
}: Readonly<ShellListRowDisclosureIconProps>) {
  return (
    <ChevronRight
      aria-hidden='true'
      data-shell-list-row-disclosure='true'
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-subtle ease-subtle motion-reduce:transition-none',
        open && 'rotate-90',
        className
      )}
      {...props}
    />
  );
}
