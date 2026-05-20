'use client';
import { memo } from 'react';
import { ShellListRowFrame } from '@/components/organisms/table/atoms/ShellListRowFrame';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { cn } from '@/lib/utils';
import { ReleaseTaskDueBadge } from './ReleaseTaskDueBadge';
import {
  isReleaseTaskAutomated,
  isReleaseTaskDone,
  ReleaseTaskAutoBadge,
  ReleaseTaskCheckbox,
  ReleaseTaskTitleText,
} from './ReleaseTaskRowPrimitives';

interface ReleaseTaskCompactRowProps {
  readonly task: ReleaseTaskView;
  readonly onToggle: (taskId: string, done: boolean) => void;
  readonly onNavigate: (taskId: string) => void;
}

export const ReleaseTaskCompactRow = memo(function ReleaseTaskCompactRow({
  task,
  onToggle,
  onNavigate,
}: ReleaseTaskCompactRowProps) {
  const isDone = isReleaseTaskDone(task);
  const isAi = isReleaseTaskAutomated(task);

  return (
    <ShellListRowFrame className='flex min-h-[28px] items-center gap-2 px-3 py-0.5'>
      <ReleaseTaskCheckbox
        task={task}
        isDone={isDone}
        onToggle={onToggle}
        className='h-3 w-3'
      />
      <button
        type='button'
        onClick={() => onNavigate(task.id)}
        className={cn(
          'flex-1 text-left text-[11.5px] truncate transition-colors',
          isAi ? 'opacity-70' : 'hover:text-accent'
        )}
      >
        <ReleaseTaskTitleText className='block' isDone={isDone}>
          {task.title}
          {isAi && (
            <ReleaseTaskAutoBadge className='ml-1 text-purple-500'>
              AI
            </ReleaseTaskAutoBadge>
          )}
        </ReleaseTaskTitleText>
      </button>
      <ReleaseTaskDueBadge
        dueDate={task.dueDate}
        dueDaysOffset={task.dueDaysOffset}
        isCompleted={isDone}
      />
    </ShellListRowFrame>
  );
});
