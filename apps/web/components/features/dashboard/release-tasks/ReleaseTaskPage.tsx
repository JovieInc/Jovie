'use client';

import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
} from '@/components/organisms/table';
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

function ReleaseTaskBreadcrumbs({
  releaseTitle,
}: Readonly<{ releaseTitle: string }>) {
  return (
    <div className='flex min-w-0 items-center gap-1.5'>
      <span className='shrink-0 text-tertiary-token'>Releases</span>
      <ChevronRight
        className='h-3 w-3 shrink-0 text-quaternary-token'
        strokeWidth={2}
        aria-hidden='true'
      />
      <span className='max-w-[min(46vw,20rem)] truncate text-secondary-token'>
        {releaseTitle}
      </span>
      <ChevronRight
        className='h-3 w-3 shrink-0 text-quaternary-token'
        strokeWidth={2}
        aria-hidden='true'
      />
      <span className='shrink-0 text-primary-token'>Tasks</span>
    </div>
  );
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
    <PageShell
      aria-label={`${releaseTitle} tasks`}
      contentClassName='overflow-y-auto overflow-x-hidden'
      contentPadding='none'
      frame='content-container'
      data-testid='release-task-page'
      toolbar={
        <PageToolbar
          start={
            <div className={PAGE_TOOLBAR_META_TEXT_CLASS}>
              <ReleaseTaskBreadcrumbs releaseTitle={releaseTitle} />
            </div>
          }
        />
      }
    >
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-3 sm:px-4 lg:px-5'>
        {showMetadataAgentPanel ? (
          <MetadataAgentPanel
            profileId={profileId}
            releaseId={releaseId}
            releaseTitle={releaseTitle}
          />
        ) : null}

        {upNextTasks.length > 0 && !allDone && (
          <section aria-label='Up next' className='space-y-2'>
            <h2 className='px-1 text-xs font-medium text-secondary-token'>
              Up next
            </h2>
            <div className='rounded-lg border border-subtle bg-surface-1 p-1 shadow-app-control'>
              {upNextTasks.map(task => (
                <ReleaseTaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </section>
        )}

        <div className='min-w-0'>
          <ReleaseTaskChecklist
            releaseId={releaseId}
            variant='full'
            releaseDate={releaseDate}
          />
        </div>
      </div>
    </PageShell>
  );
}

export function ReleaseTaskPageSkeleton() {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading release tasks'
      contentClassName='overflow-y-auto overflow-x-hidden'
      contentPadding='none'
      frame='content-container'
      toolbar={
        <PageToolbar
          start={
            <div className='flex items-center gap-1.5'>
              <div className='skeleton h-3 w-14 rounded' />
              <div className='skeleton h-3 w-3 rounded' />
              <div className='skeleton h-3 w-28 rounded' />
              <div className='skeleton h-3 w-3 rounded' />
              <div className='skeleton h-3 w-10 rounded' />
            </div>
          }
        />
      }
    >
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-3 sm:px-4 lg:px-5'>
        <div className='rounded-lg border border-subtle bg-surface-1 p-3 shadow-app-control'>
          <div className='mb-2 h-3 w-24 rounded bg-surface-2' />
          <div className='h-1 w-full rounded-full bg-surface-2' />
        </div>

        <div className='space-y-3'>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div
              key={i}
              className='h-10 animate-pulse rounded-lg bg-surface-1'
              style={{ opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
