'use client';

import { CalendarDays } from 'lucide-react';
import { ReleaseTaskCategoryGroup } from '@/components/features/dashboard/release-tasks/ReleaseTaskCategoryGroup';
import { ReleaseTaskCompactRow } from '@/components/features/dashboard/release-tasks/ReleaseTaskCompactRow';
import { ReleaseTaskProgressBar } from '@/components/features/dashboard/release-tasks/ReleaseTaskProgressBar';
import { ReleaseDueClockContext } from '@/components/molecules/ReleaseDueBadge';
import type { ReleaseTaskView } from '@/lib/release-tasks/types';

// A fixed demo schedule, shared by the progress summary and every due badge.
const now = new Date('2026-04-02T12:00:00.000Z');

function makeTask(
  id: string,
  title: string,
  category: string,
  status: ReleaseTaskView['status'],
  dueDate: string,
  dueDaysOffset: number,
  priority: ReleaseTaskView['priority']
): ReleaseTaskView {
  return {
    id,
    releaseId: 'rel-revival',
    creatorProfileId: 'demo-profile',
    templateItemId: null,
    title,
    description: null,
    explainerText: null,
    learnMoreUrl: null,
    videoUrl: null,
    category,
    status,
    priority,
    position: 0,
    assigneeType: 'human',
    assigneeUserId: null,
    aiWorkflowId: null,
    dueDaysOffset,
    dueDate: new Date(dueDate),
    completedAt:
      status === 'done' ? new Date('2026-04-01T12:00:00.000Z') : null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

const TASKS: readonly ReleaseTaskView[] = [
  makeTask(
    'task-1',
    'Finalize cover art',
    'Creative',
    'in_progress',
    '2026-04-02T12:00:00.000Z',
    0,
    'high'
  ),
  makeTask(
    'task-2',
    'Render vertical teaser',
    'Creative',
    'todo',
    '2026-04-03T12:00:00.000Z',
    1,
    'medium'
  ),
  makeTask(
    'task-3',
    'Schedule fan SMS',
    'Outreach',
    'todo',
    '2026-04-04T12:00:00.000Z',
    2,
    'high'
  ),
  makeTask(
    'task-4',
    'Approve press copy',
    'Outreach',
    'done',
    '2026-04-01T12:00:00.000Z',
    -1,
    'medium'
  ),
  makeTask(
    'task-5',
    'Verify Spotify and Apple links',
    'Distribution',
    'todo',
    '2026-04-02T12:00:00.000Z',
    0,
    'urgent'
  ),
  makeTask(
    'task-6',
    'Upload story sticker pack',
    'Distribution',
    'done',
    '2026-03-31T12:00:00.000Z',
    -2,
    'low'
  ),
] as const;

const GROUPS = [
  {
    category: 'Creative',
    tasks: TASKS.filter(task => task.category === 'Creative'),
  },
  {
    category: 'Outreach',
    tasks: TASKS.filter(task => task.category === 'Outreach'),
  },
  {
    category: 'Distribution',
    tasks: TASKS.filter(task => task.category === 'Distribution'),
  },
] as const;

const doneCount = TASKS.filter(task => task.status === 'done').length;
const overdueCount = TASKS.filter(
  task =>
    task.status !== 'done' &&
    task.dueDate &&
    task.dueDate.getTime() < now.getTime()
).length;

export function DemoReleaseTasksSurface() {
  return (
    <ReleaseDueClockContext value={now}>
      <div className='mx-auto w-full max-w-215 px-6 py-8'>
        <section
          data-testid='demo-showcase-release-tasks'
          className='overflow-hidden rounded-3xl border border-subtle bg-surface-0 shadow-[0_24px_80px_rgba(0,0,0,0.28)]'
        >
          <div className='border-b border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-6 py-5'>
            <div className='flex items-start justify-between gap-4'>
              <div>
                <p className='text-2xs uppercase tracking-[0.08em] text-tertiary-token'>
                  Demo · Apr 2, 2026
                </p>
                <h2 className='mt-2 text-2xl font-[580] tracking-[-0.03em] text-primary-token text-balance'>
                  Revival
                </h2>
                <p className='mt-2 max-w-[34rem] text-sm leading-6 text-secondary-token'>
                  Every launch task stays attached to the release, from creative
                  delivery to fan outreach and provider verification.
                </p>
              </div>

              <div className='rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-2xs text-white/72'>
                Apr 4, 2026 release
              </div>
            </div>

            <div className='mt-5 grid gap-3 sm:grid-cols-3'>
              <div className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3'>
                <p className='text-2xs text-tertiary-token'>Total tasks</p>
                <p className='mt-2 text-xl font-[580] tracking-[-0.03em] text-primary-token'>
                  {TASKS.length}
                </p>
              </div>
              <div className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3'>
                <p className='text-2xs text-tertiary-token'>Done</p>
                <p className='mt-2 text-xl font-[580] tracking-[-0.03em] text-primary-token tabular-nums'>
                  {doneCount}
                </p>
              </div>
              <div className='rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3'>
                <p className='text-2xs text-tertiary-token'>Next Review</p>
                <p className='mt-2 flex items-center gap-2 text-sm font-semibold text-primary-token'>
                  <CalendarDays className='h-4 w-4 text-tertiary-token' />
                  Apr 2 at 4:00 PM UTC
                </p>
              </div>
            </div>
          </div>

          <div className='px-4 py-4'>
            <ReleaseTaskProgressBar
              done={doneCount}
              total={TASKS.length}
              overdueCount={overdueCount}
              className='px-2'
            />

            <div className='mt-4 space-y-3'>
              {GROUPS.map(group => {
                const groupDone = group.tasks.filter(
                  task => task.status === 'done'
                ).length;
                return (
                  <div
                    key={group.category}
                    className='rounded-xl border border-subtle bg-surface-0'
                  >
                    <ReleaseTaskCategoryGroup
                      category={group.category}
                      done={groupDone}
                      total={group.tasks.length}
                      defaultOpen
                    >
                      {group.tasks.map(task => (
                        <ReleaseTaskCompactRow
                          key={task.id}
                          task={task}
                          onToggle={() => {}}
                          onNavigate={() => {}}
                        />
                      ))}
                    </ReleaseTaskCategoryGroup>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </ReleaseDueClockContext>
  );
}
