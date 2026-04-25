'use client';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@jovie/ui';
import {
  addDaysIso,
  type DemoMoment,
  fanNotificationForMoment,
  formatFridayLong,
  workflowTaskSlugsForMoment,
} from '@/lib/release-planning/demo-plan';
import { DEMO_WORKFLOW_TASKS_BY_SLUG } from '@/lib/release-planning/demo-workflow-tasks';
import { MOMENT_LABEL } from '@/lib/release-planning/moment-display';

function formatRelativeDays(n: number): string {
  if (n === 0) return 'Day-of';
  if (n < 0) return `T-${Math.abs(n)}`;
  return `T+${n}`;
}

export interface ReleaseMomentDrawerProps {
  readonly moment: DemoMoment | null;
  readonly onClose: () => void;
}

export function ReleaseMomentDrawer({
  moment,
  onClose,
}: ReleaseMomentDrawerProps) {
  const open = moment !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      {moment && (
        <SheetContent
          data-testid='release-moment-drawer'
          side='right'
          className='flex w-full max-w-lg flex-col gap-4 overflow-y-auto'
        >
          <SheetHeader>
            <div className='flex items-center gap-2'>
              <span className='rounded-full border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--linear-text-secondary)'>
                {MOMENT_LABEL[moment.momentType]}
              </span>
              <span className='text-xs text-(--linear-text-tertiary)'>
                {formatFridayLong(moment.friday)}
              </span>
            </div>
            <SheetTitle className='text-lg'>{moment.title}</SheetTitle>
          </SheetHeader>

          <section className='flex flex-col gap-2'>
            <h3 className='text-xs font-semibold uppercase tracking-wide text-(--linear-text-secondary)'>
              Workflow
            </h3>
            <ul className='flex flex-col gap-1.5'>
              {workflowTaskSlugsForMoment(moment.momentType).map(slug => {
                const task = DEMO_WORKFLOW_TASKS_BY_SLUG[slug];
                if (!task) return null;
                const dueDate = addDaysIso(moment.friday, task.relativeDays);
                return (
                  <li
                    key={slug}
                    data-testid={`release-moment-workflow-task-${slug}`}
                    data-relative-days={task.relativeDays}
                    className='flex items-start justify-between gap-2 rounded-md border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 py-2'
                  >
                    <div className='flex flex-col gap-0.5'>
                      <span className='text-sm text-(--linear-text-primary)'>
                        <span className='mr-2 font-mono text-xs text-(--linear-text-tertiary)'>
                          {formatRelativeDays(task.relativeDays)}
                        </span>
                        · <span className='font-medium'>{task.title}</span>
                      </span>
                      <span className='text-[11px] text-(--linear-text-tertiary)'>
                        {task.category} · due {dueDate}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <FanNotificationPreview moment={moment} />

          <SheetClose
            data-testid='release-moment-drawer-close'
            className='self-end rounded-md border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 py-1.5 text-sm text-(--linear-text-primary) hover:bg-(--linear-bg-surface-2)'
          >
            Close
          </SheetClose>
        </SheetContent>
      )}
    </Sheet>
  );
}

function FanNotificationPreview({ moment }: { readonly moment: DemoMoment }) {
  const notif = fanNotificationForMoment(moment);
  return (
    <section
      data-testid='fan-notification-preview'
      className='flex flex-col gap-1.5 rounded-md border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3 py-3'
    >
      <div className='flex items-center justify-between'>
        <h3 className='text-xs font-semibold uppercase tracking-wide text-(--linear-text-secondary)'>
          Fan notification
        </h3>
        <span className='rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-300'>
          {notif.channel}
        </span>
      </div>
      <p className='text-sm font-medium text-(--linear-text-primary)'>
        {notif.headline}
      </p>
      <p className='text-xs text-(--linear-text-secondary)'>{notif.body}</p>
      <p className='text-[11px] text-(--linear-text-tertiary)'>
        Sends Friday {notif.sendsAt}
      </p>
    </section>
  );
}
