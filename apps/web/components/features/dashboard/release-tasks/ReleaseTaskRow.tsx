'use client';

import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskAssigneeBadge } from './ReleaseTaskAssigneeBadge';
import { ReleaseTaskDueBadge } from './ReleaseTaskDueBadge';
import { ReleaseTaskExplainerPopover } from './ReleaseTaskExplainerPopover';

interface ReleaseTaskRowProps {
  readonly task: ReleaseTaskView;
  readonly onToggle: (taskId: string, done: boolean) => void;
}

const PRIORITY_DISPLAY: Record<string, { dots: string; color: string }> = {
  urgent: { dots: '!!!!', color: 'text-red-500' },
  high: { dots: '•••', color: 'text-red-400' },
  medium: { dots: '••', color: 'text-amber-400' },
  low: { dots: '•', color: 'text-tertiary-token' },
  none: { dots: '', color: '' },
};

export function ReleaseTaskRow({ task, onToggle }: ReleaseTaskRowProps) {
  const isDone = task.status === 'done';
  const isAi = task.assigneeType === 'ai_workflow';
  const priority = PRIORITY_DISPLAY[task.priority] ?? PRIORITY_DISPLAY.medium;

  return (
    <div className='flex items-center gap-3 px-4 py-2 min-h-[44px] group hover:bg-surface-1/50 rounded transition-colors'>
      {/* Checkbox */}
      <input
        type='checkbox'
        checked={isDone}
        disabled={isAi}
        onChange={() => onToggle(task.id, !isDone)}
        className='h-4 w-4 flex-shrink-0 rounded accent-[var(--linear-accent,#5e6ad2)] cursor-pointer disabled:cursor-default disabled:opacity-60'
        aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
      />

      {/* Title */}
      <span
        className={`flex-1 text-[11.5px] transition-colors ${
          isDone
            ? 'text-tertiary-token line-through opacity-60'
            : 'text-primary-token'
        }`}
      >
        {task.title}
        {isAi && (
          <span className='ml-1.5 text-[10px] text-purple-500 font-medium'>
            Automatic with Pro
          </span>
        )}
      </span>

      {/* Assignee badge */}
      <div className='flex-shrink-0 hidden md:block'>
        <ReleaseTaskAssigneeBadge assigneeType={task.assigneeType} />
      </div>

      {/* Due date */}
      <div className='flex-shrink-0'>
        <ReleaseTaskDueBadge
          dueDate={task.dueDate}
          dueDaysOffset={task.dueDaysOffset}
        />
      </div>

      {/* Priority */}
      {priority.dots && (
        <span
          className={`flex-shrink-0 text-[10px] w-8 text-right ${priority.color}`}
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
