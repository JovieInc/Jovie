'use client';

import { useMemo } from 'react';
import { useTaskToggleMutation } from '@/lib/queries/useReleaseTaskMutations';
import { useReleaseTasksQuery } from '@/lib/queries/useReleaseTasksQuery';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { MetadataAgentPanel } from './MetadataAgentPanel';
import { ReleaseTaskChecklist } from './ReleaseTaskChecklist';
import { ReleaseTaskRow } from './ReleaseTaskRow';

interface ReleaseTaskPageProps {
  readonly profileId: string;
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly releaseDate?: Date | string | null;
  readonly showMetadataAgentPanel?: boolean;
}

function getUpNextTasks(tasks: ReleaseTaskView[]): ReleaseTaskView[] {
  const incomplete = tasks.filter(
    t => t.status !== 'done' && t.status !== 'cancelled'
  );

  // Sort by due date (nearest first), then by position (template order)
  return [...incomplete]
    .sort((a, b) => {
      // Tasks with due dates come first
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      // No due dates — sort by position (template order)
      return a.position - b.position;
    })
    .slice(0, 3);
}

export function ReleaseTaskPage({
  profileId,
  releaseId,
  releaseTitle,
  releaseDate,
  showMetadataAgentPanel = false,
}: ReleaseTaskPageProps) {
  const { data: tasks } = useReleaseTasksQuery(releaseId);
  const toggle = useTaskToggleMutation(releaseId);

  const upNextTasks = useMemo(
    () => (tasks ? getUpNextTasks(tasks) : []),
    [tasks]
  );

  const allDone =
    tasks && tasks.length > 0 && tasks.every(t => t.status === 'done');

  const handleToggle = (taskId: string, done: boolean) => {
    toggle.mutate({ taskId, done });
  };

  return (
    <div
      className='mx-auto max-w-2xl px-4 py-6'
      data-testid='release-task-page'
    >
      {/* Breadcrumb */}
      <nav className='mb-4 text-[12px] text-tertiary-token'>
        <span className='hover:text-secondary-token cursor-pointer'>
          Releases
        </span>
        <span className='mx-1.5'>/</span>
        <span className='hover:text-secondary-token cursor-pointer'>
          {releaseTitle}
        </span>
        <span className='mx-1.5'>/</span>
        <span className='text-primary-token'>Tasks</span>
      </nav>

      {showMetadataAgentPanel ? (
        <MetadataAgentPanel
          profileId={profileId}
          releaseId={releaseId}
          releaseTitle={releaseTitle}
        />
      ) : null}

      {/* Up Next section (only when tasks exist and not all done) */}
      {upNextTasks.length > 0 && !allDone && (
        <div className='mb-6'>
          <h3 className='px-4 text-[11px] font-medium uppercase tracking-wider text-tertiary-token mb-2'>
            Up Next
          </h3>
          <div className='rounded-lg border border-(--linear-app-frame-seam) bg-surface-1'>
            {upNextTasks.map(task => (
              <ReleaseTaskRow
                key={task.id}
                task={task}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main checklist */}
      <ReleaseTaskChecklist
        releaseId={releaseId}
        variant='full'
        releaseDate={releaseDate}
      />
    </div>
  );
}
