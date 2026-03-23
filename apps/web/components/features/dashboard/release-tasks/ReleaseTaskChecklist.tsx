'use client';

import { useMemo } from 'react';
import {
  useInstantiateTasksMutation,
  useTaskToggleMutation,
} from '@/lib/queries/useReleaseTaskMutations';
import { useReleaseTasksQuery } from '@/lib/queries/useReleaseTasksQuery';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { ReleaseTaskCategoryGroup } from './ReleaseTaskCategoryGroup';
import { ReleaseTaskCompactRow } from './ReleaseTaskCompactRow';
import { ReleaseTaskEmptyState } from './ReleaseTaskEmptyState';
import { ReleaseTaskPastReleaseState } from './ReleaseTaskPastReleaseState';
import { ReleaseTaskProgressBar } from './ReleaseTaskProgressBar';
import { ReleaseTaskRow } from './ReleaseTaskRow';

interface ReleaseTaskChecklistProps {
  readonly releaseId: string;
  readonly variant: 'compact' | 'full';
  readonly releaseDate?: Date | string | null;
  readonly onNavigateToTask?: (taskId: string) => void;
  readonly onNavigateToFullPage?: () => void;
}

function groupByCategory(tasks: ReleaseTaskView[]) {
  const groups = new Map<
    string,
    { tasks: ReleaseTaskView[]; done: number; total: number }
  >();

  for (const task of tasks) {
    const cat = task.category ?? 'Other';
    const group = groups.get(cat) ?? { tasks: [], done: 0, total: 0 };
    group.tasks.push(task);
    group.total++;
    if (task.status === 'done') group.done++;
    groups.set(cat, group);
  }

  return groups;
}

function isPastRelease(releaseDate?: Date | string | null): boolean {
  if (!releaseDate) return false;
  const d =
    typeof releaseDate === 'string' ? new Date(releaseDate) : releaseDate;
  return d.getTime() < Date.now();
}

function getRelativeDueDays(dueDate: Date | string): number {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function ReleaseTaskChecklist({
  releaseId,
  variant,
  releaseDate,
  onNavigateToTask,
  onNavigateToFullPage,
}: ReleaseTaskChecklistProps) {
  const { data: tasks, isLoading } = useReleaseTasksQuery(releaseId);
  const instantiate = useInstantiateTasksMutation(releaseId);
  const toggle = useTaskToggleMutation(releaseId);

  const groups = useMemo(
    () => (tasks ? groupByCategory(tasks) : new Map()),
    [tasks]
  );

  const totalDone = tasks?.filter(t => t.status === 'done').length ?? 0;
  const totalTasks = tasks?.length ?? 0;
  const overdueCount = useMemo(() => {
    if (!tasks) return 0;
    return tasks.filter(
      t =>
        t.status !== 'done' &&
        t.status !== 'cancelled' &&
        t.dueDate &&
        getRelativeDueDays(t.dueDate) < 0
    ).length;
  }, [tasks]);

  const handleToggle = (taskId: string, done: boolean) => {
    toggle.mutate({ taskId, done });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className='space-y-2 px-3 py-2'>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div
            key={i}
            className='h-8 animate-pulse rounded bg-surface-1'
            style={{ opacity: 1 - i * 0.12 }}
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (!tasks || tasks.length === 0) {
    return (
      <div className={variant === 'compact' ? 'px-2 py-2' : ''}>
        {isPastRelease(releaseDate) ? (
          <ReleaseTaskPastReleaseState
            onSetUpAnyway={() => instantiate.mutate()}
            isLoading={instantiate.isPending}
          />
        ) : (
          <ReleaseTaskEmptyState
            onSetUp={() => instantiate.mutate()}
            isLoading={instantiate.isPending}
          />
        )}
      </div>
    );
  }

  return (
    <div className='space-y-1'>
      {/* Progress bar + optional link to full page */}
      <div className='flex items-center gap-2 px-4 py-2'>
        <ReleaseTaskProgressBar
          done={totalDone}
          total={totalTasks}
          overdueCount={overdueCount}
          className='flex-1'
        />
        {variant === 'compact' && onNavigateToFullPage && (
          <button
            type='button'
            onClick={onNavigateToFullPage}
            className='flex-shrink-0 text-[10px] text-[var(--linear-accent,#5e6ad2)] hover:underline'
          >
            Open &rarr;
          </button>
        )}
      </div>

      {/* Category groups */}
      <div className='space-y-3'>
        {Array.from(groups.entries()).map(([category, group]) => (
          <ReleaseTaskCategoryGroup
            key={category}
            category={category}
            done={group.done}
            total={group.total}
            allDone={group.done === group.total}
          >
            {group.tasks.map((task: ReleaseTaskView) =>
              variant === 'compact' ? (
                <ReleaseTaskCompactRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onNavigate={onNavigateToTask ?? (() => {})}
                />
              ) : (
                <ReleaseTaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                />
              )
            )}
          </ReleaseTaskCategoryGroup>
        ))}
      </div>
    </div>
  );
}
