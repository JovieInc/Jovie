'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { cn } from '@/lib/utils';

interface ReleaseTaskCheckboxProps {
  readonly task: ReleaseTaskView;
  readonly isDone: boolean;
  readonly onToggle: (taskId: string, done: boolean) => void;
  readonly className?: string;
}

interface ReleaseTaskTitleTextProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly isDone: boolean;
}

interface ReleaseTaskAutoBadgeProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function isReleaseTaskDone(task: ReleaseTaskView): boolean {
  return task.status === 'done';
}

export function isReleaseTaskAutomated(task: ReleaseTaskView): boolean {
  return task.assigneeType === 'ai_workflow';
}

export function ReleaseTaskCheckbox({
  task,
  isDone,
  onToggle,
  className,
}: ReleaseTaskCheckboxProps) {
  const isAutomated = isReleaseTaskAutomated(task);

  return (
    <input
      type='checkbox'
      checked={isDone}
      disabled={isAutomated}
      onChange={() => onToggle(task.id, !isDone)}
      className={cn(
        'flex-shrink-0 rounded accent-accent cursor-pointer disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-1 focus-visible:ring-offset-(--linear-bg-page) outline-none transition-[box-shadow] duration-subtle ease-subtle',
        className
      )}
      aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
    />
  );
}

export function ReleaseTaskTitleText({
  children,
  className,
  isDone,
}: ReleaseTaskTitleTextProps) {
  return (
    <span
      className={cn(
        'truncate transition-colors duration-subtle ease-subtle',
        isDone
          ? 'text-tertiary-token line-through opacity-60'
          : 'text-primary-token',
        className
      )}
    >
      {children}
    </span>
  );
}

export function ReleaseTaskAutoBadge({
  children,
  className,
  style,
}: ReleaseTaskAutoBadgeProps) {
  return (
    <span className={cn('text-3xs', className)} style={style}>
      {children}
    </span>
  );
}
