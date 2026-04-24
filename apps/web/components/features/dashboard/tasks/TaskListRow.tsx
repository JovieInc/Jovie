'use client';

import { UserAvatar } from '@jovie/ui';
import { Disc3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ReleaseDueBadge } from '@/components/molecules/ReleaseDueBadge';
import type { TaskView } from '@/lib/tasks/types';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import {
  getTaskAssigneeVisual,
  getTaskPriorityVisual,
  getTaskStageVisual,
} from './task-presentation';

interface TaskListRowProps {
  readonly task: TaskView;
  readonly artistName?: string | null;
  readonly onOpenRelease: (task: TaskView) => void;
  readonly actionSlot?: ReactNode;
  readonly isSelected?: boolean;
}

function TaskStageGlyph({ task }: Readonly<{ task: TaskView }>) {
  const stage = getTaskStageVisual(task.status, task.agentStatus);
  const accent = getAccentCssVars(stage.accent);
  const StageIcon = stage.icon;

  return (
    <div
      className='flex h-5 w-5 shrink-0 items-center justify-center'
      style={{ color: accent.solid }}
      title={`Progress ${stage.label}`}
    >
      <StageIcon
        className={cn('h-3.5 w-3.5', task.status === 'done' && 'fill-current')}
      />
    </div>
  );
}

export function PriorityBars({
  bars,
  accentColor,
}: Readonly<{ bars: number; accentColor: string }>) {
  return (
    <span className='inline-flex items-end gap-px' aria-hidden='true'>
      {[1, 2, 3, 4].map(i => (
        <span
          key={i}
          className='w-[3px] rounded-[1px]'
          style={{
            height: `${6 + i * 2}px`,
            backgroundColor: accentColor,
            opacity: i <= bars ? 1 : 0.15,
          }}
        />
      ))}
    </span>
  );
}

function TaskPriorityInline({
  task,
}: Readonly<{
  task: TaskView;
}>) {
  const meta = getTaskPriorityVisual(task.priority);

  const accent = getAccentCssVars(meta.accent);

  return (
    <span className='inline-flex min-w-0 max-w-full items-center gap-1 text-tertiary-token'>
      <PriorityBars bars={meta.bars} accentColor={accent.solid} />
      <span className='truncate'>{meta.label}</span>
    </span>
  );
}

function TaskAssigneeInline({
  task,
  artistName,
}: Readonly<{
  task: TaskView;
  artistName?: string | null;
}>) {
  const meta = getTaskAssigneeVisual(task.assigneeKind, artistName);
  const accent = getAccentCssVars(meta.accent);

  return (
    <span
      className='inline-flex min-w-0 max-w-full items-center gap-1.5 text-secondary-token'
      title={`Assignee ${meta.label}`}
    >
      <span
        aria-hidden='true'
        className='inline-flex rounded-full'
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklab, ${accent.solid} 18%, transparent)`,
        }}
      >
        <UserAvatar name={meta.avatarName} size='xs' />
      </span>
      <span className='truncate'>{meta.label}</span>
    </span>
  );
}

export function TaskListRow({
  task,
  artistName,
  onOpenRelease,
  actionSlot,
  isSelected = false,
}: Readonly<TaskListRowProps>) {
  const stage = getTaskStageVisual(task.status, task.agentStatus);
  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';

  return (
    <div
      data-selected={isSelected ? 'true' : undefined}
      data-testid={`task-list-row-${task.id}`}
      className={cn(
        'grid h-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_4.75rem] items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-[background-color,border-color,box-shadow,opacity]',
        'group-hover/task-row:bg-[color-mix(in_oklab,var(--linear-row-hover)_72%,transparent)]',
        'group-focus-visible/task-row:border-[color-mix(in_oklab,var(--linear-border-focus)_58%,transparent)] group-focus-visible/task-row:bg-[color-mix(in_oklab,var(--linear-row-hover)_66%,var(--linear-app-content-surface))] group-focus-visible/task-row:shadow-[inset_0_0_0_1px_var(--linear-border-focus)]',
        isSelected &&
          'border-[color-mix(in_oklab,var(--linear-app-frame-seam)_82%,transparent)] bg-[color-mix(in_oklab,var(--linear-row-hover)_66%,var(--linear-app-content-surface))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_12%,transparent),inset_0_1px_0_rgba(255,255,255,0.03)]',
        isDone && !isSelected && 'opacity-75',
        isCancelled && !isSelected && 'opacity-60'
      )}
    >
      <TaskStageGlyph task={task} />

      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            'truncate text-[12.75px] font-semibold leading-[17px] text-primary-token',
            isDone && 'text-secondary-token',
            isCancelled && 'text-tertiary-token'
          )}
        >
          {task.title}
        </p>

        <div
          data-testid={`task-list-row-meta-${task.id}`}
          className='mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 overflow-hidden text-[10.5px] leading-none text-secondary-token'
        >
          <span className='shrink-0 truncate text-tertiary-token'>
            {stage.label}
          </span>
          <span className='shrink-0 truncate font-semibold text-tertiary-token'>
            J-{task.taskNumber}
          </span>
          <div className='min-w-0 max-w-full overflow-hidden text-left'>
            <TaskPriorityInline task={task} />
          </div>
          <div className='min-w-0 max-w-full overflow-hidden text-left'>
            <TaskAssigneeInline task={task} artistName={artistName} />
          </div>
          {task.releaseTitle ? (
            <button
              type='button'
              onClick={event => {
                event.stopPropagation();
                onOpenRelease(task);
              }}
              className='inline-flex min-w-0 max-w-full items-center gap-1 text-secondary-token transition-colors hover:text-primary-token focus-visible:outline-none focus-visible:text-primary-token'
              title={task.releaseTitle}
            >
              <Disc3 className='h-3 w-3 shrink-0 text-tertiary-token' />
              <span className='min-w-0 truncate'>{task.releaseTitle}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className='flex min-w-[4.75rem] shrink-0 items-center justify-end gap-1.5'>
        <div className='flex min-w-0 flex-1 items-center justify-end overflow-hidden'>
          {task.dueAt ? (
            <ReleaseDueBadge
              dueDate={task.dueAt}
              dueDaysOffset={null}
              isCompleted={isDone || isCancelled}
            />
          ) : null}
        </div>
        <div className='shrink-0'>{actionSlot}</div>
      </div>
    </div>
  );
}
