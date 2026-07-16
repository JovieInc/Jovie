import { Skeleton } from '@jovie/ui';
import { PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';

const TASK_ROWS = [
  { key: 'task-1', titleWidth: '72%', metaWidth: '38%' },
  { key: 'task-2', titleWidth: '84%', metaWidth: '44%' },
  { key: 'task-3', titleWidth: '64%', metaWidth: '32%' },
  { key: 'task-4', titleWidth: '78%', metaWidth: '48%' },
  { key: 'task-5', titleWidth: '58%', metaWidth: '36%' },
] as const;

const BOARD_COLUMNS = ['backlog', 'todo', 'progress'] as const;

export function TasksRouteSkeleton() {
  return (
    <PageShell
      aria-label='Loading Tasks'
      aria-busy='true'
      aria-live='polite'
      className='absolute inset-0 overflow-hidden'
      toolbar={
        <PageToolbar
          start={
            <div className='flex items-center gap-1.5'>
              <Skeleton className='h-7 w-20' rounded='full' />
              <Skeleton className='h-7 w-28' rounded='full' />
              <Skeleton className='h-7 w-32' rounded='full' />
            </div>
          }
          end={
            <div className='flex items-center gap-1'>
              <Skeleton className='h-7 w-7' rounded='full' />
              <Skeleton className='h-7 w-7' rounded='full' />
            </div>
          }
          className='h-(--linear-app-header-height-compact) min-h-(--linear-app-header-height-compact)'
        />
      }
    >
      <section className='flex min-h-0 flex-1 flex-col overflow-hidden pb-2'>
        <div className='hidden min-h-0 flex-1 gap-2 px-2.5 pt-0.5 lg:flex'>
          {BOARD_COLUMNS.map(column => (
            <div
              key={`task-board-skeleton-${column}`}
              className='min-w-0 flex-1 rounded-lg border border-subtle bg-surface-1 p-2'
            >
              <Skeleton className='mb-3 h-4 w-20' />
              <div className='space-y-2'>
                {TASK_ROWS.slice(0, 3).map(row => (
                  <div
                    key={`${column}-${row.key}`}
                    className='rounded-md border border-subtle bg-surface-0 p-2.5'
                  >
                    <Skeleton
                      className='h-3.5 rounded'
                      style={{ width: row.titleWidth }}
                    />
                    <Skeleton
                      className='mt-2 h-3 rounded'
                      style={{ width: row.metaWidth }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className='flex min-h-0 flex-1 flex-col px-2.5 pt-0.5 lg:hidden'>
          {TASK_ROWS.map(row => (
            <div
              key={row.key}
              className='flex h-16 shrink-0 items-center border-b border-subtle px-2'
            >
              <div className='min-w-0 flex-1 space-y-2'>
                <Skeleton
                  className='h-3.5 rounded'
                  style={{ width: row.titleWidth }}
                />
                <Skeleton
                  className='h-3 rounded'
                  style={{ width: row.metaWidth }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
