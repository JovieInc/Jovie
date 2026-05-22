'use client';

import React from 'react';
import { ShellListRowFrame } from '@/components/organisms/table/atoms/ShellListRowFrame';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import {
  getAccentCssVars,
  TASK_PRIORITY_ACCENT,
} from '@/lib/ui/accent-palette';
import { ReleaseTaskAssigneeBadge } from './ReleaseTaskAssigneeBadge';
import { ReleaseTaskDueBadge } from './ReleaseTaskDueBadge';
import { ReleaseTaskExplainerPopover } from './ReleaseTaskExplainerPopover';
import {
  isReleaseTaskAutomated,
  isReleaseTaskDone,
  ReleaseTaskAutoBadge,
  ReleaseTaskCheckbox,
  ReleaseTaskTitleText,
} from './ReleaseTaskRowPrimitives';

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

/**
 * ReleaseTaskRow — full list row renderer for release tasks in checklists / tables.
 * High-churn over real production ReleaseTaskView data (status, priority, due, assignee).
 *
 * Memoized + canonical focus rings + DS subtle motion only (shell handoff rot 20).
 * Container-aware via ShellListRowFrame (subtraction).
 */
export const ReleaseTaskRow = React.memo(function ReleaseTaskRow({
  task,
  onToggle,
}: ReleaseTaskRowProps) {
  const isDone = isReleaseTaskDone(task);
  const isAi = isReleaseTaskAutomated(task);
  const priority = PRIORITY_DISPLAY[task.priority] ?? PRIORITY_DISPLAY.medium;
  const priorityAccent =
    task.priority === 'none'
      ? null
      : getAccentCssVars(TASK_PRIORITY_ACCENT[task.priority]);
  const aiAccent = getAccentCssVars('purple');

  return (
    <ShellListRowFrame className='flex min-h-[32px] items-center gap-2 px-4 py-1'>
      <ReleaseTaskCheckbox
        task={task}
        isDone={isDone}
        onToggle={onToggle}
        className='h-3.5 w-3.5'
      />

      <ReleaseTaskTitleText className='flex-1 text-[11.5px]' isDone={isDone}>
        {task.title}
        {isAi && (
          <ReleaseTaskAutoBadge
            className='ml-1.5 text-3xs font-medium'
            style={{ color: aiAccent.solid }}
          >
            Auto
          </ReleaseTaskAutoBadge>
        )}
      </ReleaseTaskTitleText>

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
    </ShellListRowFrame>
  );
});
