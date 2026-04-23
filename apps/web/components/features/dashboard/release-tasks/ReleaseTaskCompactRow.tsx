'use client';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskDueBadge } from './ReleaseTaskDueBadge';

interface ReleaseTaskCompactRowProps {
  readonly task: ReleaseTaskView;
  readonly onToggle: (taskId: string, done: boolean) => void;
  readonly onNavigate: (taskId: string) => void;
}

export function ReleaseTaskCompactRow({
  task,
  onToggle,
  onNavigate,
}: ReleaseTaskCompactRowProps) {
  const isDone = task.status === 'done';
  const isAi = task.assigneeType === 'ai_workflow';

  return (
    <div className='flex items-center gap-2 px-3 py-0.5 min-h-[28px] group hover:bg-surface-1 rounded transition-colors'>
      <input
        type='checkbox'
        checked={isDone}
        disabled={isAi}
        onChange={() => onToggle(task.id, !isDone)}
        className='h-3 w-3 flex-shrink-0 rounded accent-[var(--linear-accent,#5e6ad2)] cursor-pointer disabled:cursor-default disabled:opacity-60'
        aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'complete'}`}
      />
      <button
        type='button'
        onClick={() => onNavigate(task.id)}
        className={`flex-1 text-left text-[11.5px] truncate transition-colors ${
          isDone
            ? 'text-tertiary-token line-through opacity-60'
            : 'text-primary-token'
        } ${isAi ? 'opacity-70' : 'hover:text-[var(--linear-accent,#5e6ad2)]'}`}
      >
        {task.title}
        {isAi && <span className='ml-1 text-3xs text-purple-500'>AI</span>}
      </button>
      <ReleaseTaskDueBadge
        dueDate={task.dueDate}
        dueDaysOffset={task.dueDaysOffset}
        isCompleted={isDone}
      />
    </div>
  );
}
