import type { ComponentPropsWithoutRef } from 'react';
import { cn, rowState } from '../table.styles';

export type ShellListRowInteraction = 'self' | 'task-row-group' | 'none';
export type ShellListRowDensity = 'compact' | 'default';

export interface ShellListRowFrameProps
  extends ComponentPropsWithoutRef<'div'> {
  readonly isSelected?: boolean;
  readonly interaction?: ShellListRowInteraction;
  readonly interactive?: boolean;
  readonly density?: ShellListRowDensity;
}

export interface ShellListRowButtonProps
  extends ComponentPropsWithoutRef<'button'> {
  readonly isSelected?: boolean;
  readonly interaction?: ShellListRowInteraction;
  readonly interactive?: boolean;
  readonly density?: ShellListRowDensity;
}

function getTaskRowGroupState(isSelected: boolean): string {
  if (isSelected) {
    return 'system-b-shell-list-task-row-selected';
  }

  return 'system-b-shell-list-task-row-hover';
}

export function getShellListRowFrameClassName({
  className,
  interaction = 'self',
  interactive = false,
  isSelected = false,
  density = 'default',
}: Readonly<{
  className?: string;
  interaction?: ShellListRowInteraction;
  interactive?: boolean;
  isSelected?: boolean;
  density?: ShellListRowDensity;
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
    density === 'compact' ? 'min-h-7' : 'min-h-8',
    interactive && 'cursor-pointer',
    interactionClassName,
    className
  );
}

export function ShellListRowFrame({
  className,
  interaction = 'self',
  interactive = false,
  isSelected = false,
  density = 'default',
  ...props
}: Readonly<ShellListRowFrameProps>) {
  return (
    <div
      data-shell-list-row='true'
      data-selected={isSelected ? 'true' : undefined}
      className={getShellListRowFrameClassName({
        className,
        interaction,
        interactive,
        isSelected,
        density,
      })}
      {...props}
    />
  );
}

export function ShellListRowButton({
  className,
  interaction = 'self',
  interactive = true,
  isSelected = false,
  density = 'default',
  type = 'button',
  ...props
}: Readonly<ShellListRowButtonProps>) {
  return (
    <button
      type={type}
      data-shell-list-row='true'
      data-selected={isSelected ? 'true' : undefined}
      className={getShellListRowFrameClassName({
        className,
        interaction,
        interactive,
        isSelected,
        density,
      })}
      {...props}
    />
  );
}
