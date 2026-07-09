'use client';

import { UserAvatar } from '@jovie/ui';
import { Disc3, Sparkles, Tag } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { ShellListRowFrame } from '@/components/organisms/table';
import { DueChip } from '@/components/shell/DueChip';
import { toDueIso } from '@/lib/tasks/task-due-date';
import type { TaskView } from '@/lib/tasks/types';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import {
  getTaskAssigneeVisual,
  getTaskCategoryLabel,
  getTaskPriorityVisual,
  getTaskStageVisual,
  isTaskAgentWorking,
} from './task-presentation';

interface TaskListRowProps {
  readonly task: TaskView;
  readonly artistName?: string | null;
  readonly onOpenRelease: (task: TaskView) => void;
  readonly actionSlot?: ReactNode;
  readonly isSelected?: boolean;
  /** Hide when the assignee subview already scopes the list. */
  readonly showAssignee?: boolean;
  /** Hide when the detail pane already shows the task title. */
  readonly hideTitle?: boolean;
  /** Hide when the detail pane already shows the due state. */
  readonly hideDue?: boolean;
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
          className='w-1 rounded-xs'
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

function TaskCategoryInline({ label }: Readonly<{ label: string }>) {
  return (
    <span
      className='inline-flex min-w-0 max-w-full items-center gap-1 text-tertiary-token'
      title={`Category ${label}`}
    >
      <Tag className='h-3 w-3 shrink-0' aria-hidden='true' />
      <span className='truncate'>{label}</span>
    </span>
  );
}

function TaskAgentWorkingGlyph() {
  return (
    <span
      className='inline-flex h-4 w-4 shrink-0 items-center justify-center text-accent-blue'
      title='Jovie is working on this'
    >
      <span className='relative inline-grid h-3 w-3 place-items-center'>
        <span
          aria-hidden='true'
          className='absolute inset-0 rounded-full bg-accent-blue-subtle anim-calm-halo'
        />
        <Sparkles className='relative h-3 w-3' strokeWidth={2.25} />
      </span>
      <span className='sr-only'>Jovie working</span>
    </span>
  );
}

export const TaskListRow = memo(function TaskListRow({
  task,
  artistName,
  onOpenRelease,
  actionSlot,
  isSelected = false,
  showAssignee = true,
  hideTitle = false,
  hideDue = false,
}: Readonly<TaskListRowProps>) {
  const stage = getTaskStageVisual(task.status, task.agentStatus);
  const isDone = task.status === 'done';
  const isCancelled = task.status === 'cancelled';
  const isMuted = isDone || isCancelled;
  const categoryLabel = getTaskCategoryLabel(task.category);
  const dueIso = hideDue ? null : toDueIso(task.dueAt);
  const agentWorking = isTaskAgentWorking(
    task.assigneeKind,
    task.status,
    task.agentStatus
  );

  return (
    <ShellListRowFrame
      data-testid={`task-list-row-${task.id}`}
      isSelected={isSelected}
      interaction='task-row-group'
      className={cn(
        'group/row flex h-full items-center gap-3 px-3 py-1.5 transition-[opacity] duration-subtle ease-subtle',
        isDone && !isSelected && 'opacity-75',
        isCancelled && !isSelected && 'opacity-60'
      )}
    >
      <span className='flex shrink-0 items-center'>
        <TaskStageGlyph task={task} />
      </span>

      <div className='min-w-0 flex-1'>
        {hideTitle ? null : (
          <div className='flex min-w-0 items-center gap-1.5'>
            <p
              className={cn(
                'min-w-0 truncate text-app font-semibold leading-tight text-primary-token',
                isDone && 'text-secondary-token',
                isCancelled && 'text-tertiary-token'
              )}
            >
              {task.title}
            </p>
            {agentWorking ? <TaskAgentWorkingGlyph /> : null}
          </div>
        )}

        <div
          data-testid={`task-list-row-meta-${task.id}`}
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 overflow-hidden text-3xs leading-none text-secondary-token',
            !hideTitle && 'mt-0.5'
          )}
        >
          {dueIso ? <DueChip dueIso={dueIso} muted={isMuted} /> : null}
          <span className='shrink-0 truncate text-tertiary-token'>
            {stage.label}
          </span>
          <span className='shrink-0 truncate font-semibold text-tertiary-token'>
            J-{task.taskNumber}
          </span>
          {categoryLabel ? (
            <div className='min-w-0 max-w-full overflow-hidden text-left'>
              <TaskCategoryInline label={categoryLabel} />
            </div>
          ) : null}
          <div className='min-w-0 max-w-full overflow-hidden text-left'>
            <TaskPriorityInline task={task} />
          </div>
          {showAssignee ? (
            <div className='min-w-0 max-w-full overflow-hidden text-left'>
              <TaskAssigneeInline task={task} artistName={artistName} />
            </div>
          ) : null}
          {task.releaseTitle ? (
            <button
              type='button'
              onClick={event => {
                event.stopPropagation();
                onOpenRelease(task);
              }}
              className='inline-flex min-w-0 max-w-full items-center gap-1 text-secondary-token transition-colors duration-subtle ease-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page) focus-visible:text-primary-token'
              title={task.releaseTitle}
            >
              <Disc3 className='h-3 w-3 shrink-0 text-tertiary-token' />
              <span className='min-w-0 truncate'>{task.releaseTitle}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className='flex shrink-0 items-center justify-end'>{actionSlot}</div>
    </ShellListRowFrame>
  );
});
