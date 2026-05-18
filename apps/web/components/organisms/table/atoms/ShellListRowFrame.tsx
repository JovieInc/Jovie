import type { ComponentPropsWithoutRef } from 'react';
import { cn, rowState } from '../table.styles';

export type ShellListRowInteraction = 'self' | 'task-row-group' | 'none';

export interface ShellListRowFrameProps
  extends ComponentPropsWithoutRef<'div'> {
  readonly isSelected?: boolean;
  readonly interaction?: ShellListRowInteraction;
  readonly interactive?: boolean;
}

function getTaskRowGroupState(isSelected: boolean): string {
  if (isSelected) {
    return cn(
      rowState.selected,
      'group-hover/task-row:bg-(--linear-row-selected) group-focus-visible/task-row:bg-(--linear-row-selected) group-focus-visible/task-row:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_24%,transparent)]'
    );
  }

  return 'group-hover/task-row:bg-(--linear-row-hover) group-focus-visible/task-row:bg-(--linear-row-hover) group-focus-visible/task-row:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_45%,transparent)]';
}

export function getShellListRowFrameClassName({
  className,
  interaction = 'self',
  interactive = false,
  isSelected = false,
}: Readonly<{
  className?: string;
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
      })}
      {...props}
    />
  );
}
