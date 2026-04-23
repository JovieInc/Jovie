'use client';

import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import {
  getAccentCssVars,
  TASK_PRIORITY_ACCENT,
} from '@/lib/ui/accent-palette';
import { ReleaseTaskAssigneeBadge } from './ReleaseTaskAssigneeBadge';
import { ReleaseTaskDueBadge } from './ReleaseTaskDueBadge';
import { ReleaseTaskExplainerPopover } from './ReleaseTaskExplainerPopover';

interface ReleaseTaskRowProps {
  readonly task: ReleaseTaskView;
  readonly onToggle: (taskId: string, done: boolean) => void;
}

const PRIORITY_DISPLAY: Record<string, { dots: string }> = {
  urgent: { dots: '!!!!' },
  high: { dots: '•••' },
  medium: { dots: '••' },
  low: { dots: '•' },
  none: { dots: '' },
};

export function ReleaseTaskRow({ task, onToggle }: ReleaseTaskRowProps) {
  const isDone = task.status === 'done';
  const isAi = task.assigneeType === 'ai_workflow';
  const priority = PRIORITY_DISPLAY[task.priority] ?? PRIORITY_DISPLAY.medium;
  const priorityAccent =
    task.priority === 'none'
      ? null
      : getAccentCssVars(TASK_PRIORITY_ACCENT[task.priority]);
  const aiAccent = getAccentCssVars('purple');

  return (
    <div className='flex items-center gap-2 px-4 py-1 min-h-[32px] group hover:bg-surface-1 rounded transition-colors'>
      {/* Checkbox */}
      <input
        type='checkbox'
        checked={isDone}
        disabled={isAi}
        onChange={() => onToggle(task.id, !isDone)}
        className='h-3.5 w-3.5 flex-shrink-0 rounded accent-[var(--linear-accent,#5e6ad2)] cursor-pointer disabled:cursor-default disabled:opacity-60'
        aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
      />

      {/* Title */}
      <span
        className={`flex-1 text-[11.5px] truncate transition-colors ${
          isDone
            ? 'text-tertiary-token line-through opacity-60'
            : 'text-primary-token'
        }`}
      >
        {task.title}
        {isAi && (
          <span
            className='ml-1.5 text-3xs font-medium'
            style={{ color: aiAccent.solid }}
          >
            Auto
          </span>
        )}
      </span>

      {/* Assignee badge */}
      <div className='flex-shrink-0 max-md:hidden'>
        <ReleaseTaskAssigneeBadge assigneeType={task.assigneeType} />
      </div>

      {/* Due date */}
      <div className='flex-shrink-0'>
        <ReleaseTaskDueBadge
          dueDate={task.dueDate}
          dueDaysOffset={task.dueDaysOffset}
          isCompleted={isDone}
        />
      </div>

      {/* Priority */}
      {priority.dots && (
        <span
          className='flex-shrink-0 w-6 text-right text-3xs'
          style={priorityAccent ? { color: priorityAccent.solid } : undefined}
          title={task.priority}
        >
          {priority.dots}
        </span>
      )}

      {/* Explainer popover */}
      {task.explainerText && (
        <ReleaseTaskExplainerPopover
          explainerText={task.explainerText}
          learnMoreUrl={task.learnMoreUrl}
        />
      )}
    </div>
  );
}
