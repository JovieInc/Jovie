'use client';

import { UserAvatar } from '@jovie/ui';
import { Disc3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ReleaseTaskDueBadge } from '@/components/features/dashboard/release-tasks/ReleaseTaskDueBadge';
import type { TaskView } from '@/lib/tasks/types';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import {
  getTaskAssigneeMeta,
  getTaskPriorityMeta,
  getTaskVisualStage,
} from './task-presentation';

interface TaskListRowProps {
  readonly task: TaskView;
  readonly artistName?: string | null;
  readonly onOpenRelease: (task: TaskView) => void;
  readonly actionSlot?: ReactNode;
}

function TaskStageGlyph({ task }: Readonly<{ task: TaskView }>) {
  const stage = getTaskVisualStage(task.status, task.agentStatus);
  const accent = getAccentCssVars(stage.accent);
  const StageIcon = stage.icon;

  return (
    <div
      className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full border'
      style={{
        borderColor: `color-mix(in oklab, ${accent.solid} 24%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${accent.solid} 14%, transparent)`,
        color: accent.solid,
      }}
      title={`Progress ${stage.label}`}
    >
      <StageIcon
        className={cn(
          'h-3.5 w-3.5',
          task.status === 'done' && 'fill-current',
          task.status === 'in_progress' &&
            stage.percent === 50 &&
            'animate-spin [animation-duration:3s]'
        )}
      />
    </div>
  );
}

function TaskPriorityInline({
  task,
}: Readonly<{
  task: TaskView;
}>) {
  const meta = getTaskPriorityMeta(task.priority);
  if (!meta) {
    return null;
  }

  const accent = getAccentCssVars(meta.accent);

  return (
    <span
      className='inline-flex shrink-0 items-center gap-1 text-tertiary-token'
      title={`Priority ${meta.label}`}
    >
      <span
        className='h-1.5 w-1.5 rounded-full'
        style={{ backgroundColor: accent.solid }}
        aria-hidden='true'
      />
      <span>{meta.label}</span>
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
  const meta = getTaskAssigneeMeta(task.assigneeKind, artistName);
  const accent = getAccentCssVars(meta.accent);

  return (
    <span
      className='inline-flex shrink-0 items-center gap-1.5 text-secondary-token'
      title={`Assignee ${meta.label}`}
    >
      <span
        className='inline-flex rounded-full'
        style={{
          boxShadow: `0 0 0 1px color-mix(in oklab, ${accent.solid} 18%, transparent)`,
        }}
      >
        <UserAvatar name={meta.name} size='xs' />
      </span>
      <span>{meta.label}</span>
    </span>
  );
}

export function TaskListRow({
  task,
  artistName,
  onOpenRelease,
  actionSlot,
}: Readonly<TaskListRowProps>) {
  const stage = getTaskVisualStage(task.status, task.agentStatus);
  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';

  return (
    <div className='flex h-full min-w-0 items-center gap-3 py-2'>
      <TaskStageGlyph task={task} />

      <div className='min-w-0 flex-1'>
        <p
          className={cn(
            'truncate text-[12.75px] font-[590] leading-[17px] text-primary-token',
            isDone && 'text-secondary-token',
            isCancelled && 'text-tertiary-token'
          )}
        >
          {task.title}
        </p>

        <div className='mt-1 flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[10.5px] leading-none text-secondary-token'>
          <span className='w-[6.5rem] shrink-0 truncate text-tertiary-token'>
            {stage.label}
          </span>
          <span className='shrink-0 font-[560] text-tertiary-token'>
            J-{task.taskNumber}
          </span>
          <TaskPriorityInline task={task} />
          <TaskAssigneeInline task={task} artistName={artistName} />
          {task.releaseTitle ? (
            <button
              type='button'
              onClick={event => {
                event.stopPropagation();
                onOpenRelease(task);
              }}
              className='inline-flex min-w-0 items-center gap-1 text-secondary-token transition-colors hover:text-primary-token'
              title={task.releaseTitle}
            >
              <Disc3 className='h-3 w-3 shrink-0 text-tertiary-token' />
              <span className='truncate'>{task.releaseTitle}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className='flex w-[6.25rem] shrink-0 items-center justify-end gap-1'>
        <div className='min-w-0 max-w-[4.75rem] truncate text-right'>
          {task.dueAt ? (
            <ReleaseTaskDueBadge
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
