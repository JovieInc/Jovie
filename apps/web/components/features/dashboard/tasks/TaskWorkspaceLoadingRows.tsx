import { ShellListRowFrame } from '@/components/organisms/table';

const TASK_LOADING_ROWS = [
  { key: 'task-loading-1', titleWidth: '72%', metaWidth: '40%' },
  { key: 'task-loading-2', titleWidth: '56%', metaWidth: '30%' },
  { key: 'task-loading-3', titleWidth: '86%', metaWidth: '44%' },
  { key: 'task-loading-4', titleWidth: '64%', metaWidth: '34%' },
  { key: 'task-loading-5', titleWidth: '77%', metaWidth: '38%' },
] as const;

/** Shared Tasks route/client loading geometry to prevent reload composition swaps. */
export function TaskWorkspaceLoadingRows() {
  return (
    <div
      role='status'
      aria-busy='true'
      className='flex min-h-0 flex-1 flex-col gap-1.5 px-2.5 pb-2 pt-0.5 max-sm:px-4 max-sm:pb-4 max-sm:pt-2'
      data-testid='task-workspace-loading-rows'
    >
      <span className='sr-only'>Loading tasks</span>
      {TASK_LOADING_ROWS.map(row => (
        <ShellListRowFrame
          key={row.key}
          interaction='none'
          data-testid='task-loading-row'
          className='group/row flex min-h-16 items-center gap-3 px-3 py-1.5'
        >
          <span className='flex shrink-0 items-center'>
            <span
              className='skeleton h-5 w-5 rounded-full'
              aria-hidden='true'
            />
          </span>
          <span className='min-w-0 flex-1'>
            <span
              className='skeleton block h-3.5 max-w-full rounded'
              style={{ width: row.titleWidth }}
              aria-hidden='true'
            />
            <span className='mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
              <span
                className='skeleton h-3 rounded'
                style={{ width: row.metaWidth }}
                aria-hidden='true'
              />
            </span>
          </span>
          <span className='flex shrink-0 items-center justify-end'>
            <span
              className='skeleton h-5 w-14 rounded-full'
              aria-hidden='true'
            />
          </span>
        </ShellListRowFrame>
      ))}
    </div>
  );
}
