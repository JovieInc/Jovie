import { TaskWorkspaceLoadingRows } from '@/components/features/dashboard/tasks/TaskWorkspaceLoadingRows';
import { PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';

export function TasksRouteSkeleton() {
  return (
    <PageShell
      aria-label='Loading Tasks'
      aria-busy='true'
      aria-live='polite'
      className='absolute inset-0 overflow-hidden'
      surfaceClassName='p-0'
      toolbar={
        <PageToolbar
          start={
            <div className='flex items-center gap-1.5'>
              <span className='skeleton h-7 w-20 rounded-full' />
              <span className='skeleton h-7 w-28 rounded-full' />
              <span className='skeleton h-7 w-32 rounded-full' />
            </div>
          }
          end={
            <div className='flex items-center gap-1'>
              <span className='skeleton h-7 w-7 rounded-full' />
              <span className='skeleton h-7 w-7 rounded-full' />
            </div>
          }
          className='h-(--linear-app-header-height-compact) min-h-(--linear-app-header-height-compact) max-sm:px-4'
        />
      }
    >
      <section className='flex min-h-0 flex-1 flex-col gap-1 overflow-hidden pb-1'>
        <TaskWorkspaceLoadingRows />
      </section>
    </PageShell>
  );
}
