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

function TaskPriorityInline({
  task,
}: Readonly<{
  task: TaskView;
}>) {
  const meta = getTaskPriorityVisual(task.priority);

  const accent = getAccentCssVars(meta.accent);

  return (
    <span className='inline-flex min-w-0 items-center gap-1 text-tertiary-token'>
      <span
        className='h-1.5 w-1.5 rounded-full'
        style={{ backgroundColor: accent.solid }}
        aria-hidden='true'
      />
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
      className='inline-flex shrink-0 items-center gap-1.5 text-secondary-token'
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
      className={cn(
        'flex h-full min-w-0 items-center gap-3 px-0 py-2.5 transition-[background-color,opacity]',
        'group-hover/task-row:bg-[color-mix(in_oklab,var(--linear-row-hover)_52%,transparent)]',
        'group-focus-visible/task-row:bg-[color-mix(in_oklab,var(--linear-row-hover)_62%,transparent)]',
        isSelected &&
          'bg-[color-mix(in_oklab,var(--linear-row-hover)_68%,transparent)]',
        isDone && !isSelected && 'opacity-80',
        isCancelled && !isSelected && 'opacity-60'
      )}
    >
      <TaskStageGlyph task={task} />

      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            'truncate text-[12.75px] font-[590] leading-[17px] text-[color-mix(in_oklab,var(--text-primary)_84%,var(--text-secondary))]',
            isSelected &&
              'text-[color-mix(in_oklab,var(--text-primary)_92%,var(--text-secondary))]',
            isDone && 'text-secondary-token',
            isCancelled && 'text-tertiary-token'
          )}
        >
          {task.title}
        </p>

        <div className='mt-1.25 grid min-w-0 grid-cols-[4.15rem_2.1rem_3.45rem_3.4rem_minmax(0,1fr)] items-center gap-1.25 overflow-hidden whitespace-nowrap text-[10.5px] leading-none text-secondary-token'>
          <span className='truncate text-[color-mix(in_oklab,var(--text-secondary)_78%,var(--text-tertiary))]'>
            {stage.label}
          </span>
          <span className='truncate font-[560] text-tertiary-token'>
            J-{task.taskNumber}
          </span>
          <div className='min-w-0 overflow-hidden text-left'>
            <TaskPriorityInline task={task} />
          </div>
          <div className='min-w-0 overflow-hidden text-left'>
            <TaskAssigneeInline task={task} artistName={artistName} />
          </div>
          {task.releaseTitle ? (
            <button
              type='button'
              onClick={event => {
                event.stopPropagation();
                onOpenRelease(task);
              }}
              className='inline-flex min-w-0 items-center gap-1 text-secondary-token transition-colors hover:text-primary-token focus-visible:outline-none focus-visible:text-primary-token'
              title={task.releaseTitle}
            >
              <Disc3 className='h-3 w-3 shrink-0 text-tertiary-token' />
              <span className='min-w-0 truncate'>{task.releaseTitle}</span>
            </button>
          ) : (
            <span className='block min-w-0 truncate text-tertiary-token/0'>
              &nbsp;
            </span>
          )}
        </div>
      </div>

      <div className='ml-3 flex shrink-0 items-center justify-end gap-1.5'>
        <div className='min-w-0 truncate text-right'>
          {task.dueAt ? (
            <ReleaseDueBadge
              dueDate={task.dueAt}
              dueDaysOffset={null}
              isCompleted={isDone}
            />
          ) : null}
        </div>
        <div className='shrink-0'>{actionSlot}</div>
      </div>
    </div>
  );
}
