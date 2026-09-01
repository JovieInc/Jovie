'use client';

import { useMemo } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
  PageToolbarBackLink,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useTaskToggleMutation } from '@/lib/queries/useReleaseTaskMutations';
import { useReleaseTasksQuery } from '@/lib/queries/useReleaseTasksQuery';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';
import { cn } from '@/lib/utils';
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

function ReleaseTaskToolbarStart({
  releaseTitle,
}: Readonly<{ releaseTitle: string }>) {
  return (
    <div
      className='flex min-w-0 flex-1 items-center gap-2'
      data-testid='release-task-toolbar-context'
    >
      <PageToolbarBackLink
        href={APP_ROUTES.RELEASES}
        label='Releases'
        ariaLabel='Back to releases'
      />
      <span
        className={cn(PAGE_TOOLBAR_META_TEXT_CLASS, 'min-w-0 truncate')}
        title={releaseTitle}
      >
        {releaseTitle}
      </span>
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
          start={<ReleaseTaskToolbarStart releaseTitle={releaseTitle} />}
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
          // eslint-disable-next-line @jovie/canonical-ui-label-casing -- Preserve established release-playbook copy in this substrate-only migration.
          <section aria-label='Up next' className='space-y-2'>
            {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- Preserve established release-playbook copy in this substrate-only migration. */}
            <h2 className='px-1 text-xs font-medium text-secondary-token'>
              Up next
            </h2>
            <ContentSurfaceCard
              surface='nested'
              className='p-1 shadow-app-control'
              data-testid='release-task-up-next-card'
            >
              {upNextTasks.map(task => (
                <ReleaseTaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                />
              ))}
            </ContentSurfaceCard>
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

/* eslint-disable @jovie/canonical-ui-label-casing -- Preserve the existing loading announcement in this substrate-only migration. */
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
            <div className='flex min-w-0 flex-1 items-center gap-2'>
              <div className='skeleton h-7 w-24 shrink-0 rounded-full' />
              <div className='skeleton h-3 min-w-0 flex-1 rounded' />
            </div>
          }
        />
      }
    >
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-3 sm:px-4 lg:px-5'>
        <ContentSurfaceCard
          surface='nested'
          className='p-3 shadow-app-control'
          data-testid='release-task-skeleton-summary-card'
        >
          <div className='mb-2 h-3 w-24 rounded bg-surface-2' />
          <div className='h-1 w-full rounded-full bg-surface-2' />
        </ContentSurfaceCard>

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
/* eslint-enable @jovie/canonical-ui-label-casing */
