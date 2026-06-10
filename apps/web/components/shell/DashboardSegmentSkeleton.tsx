const DASHBOARD_LOADING_ROWS = [1, 2, 3, 4] as const;

interface DashboardSegmentSkeletonProps {
  readonly rowKeyPrefix?: string;
}

/**
 * Default dashboard-style table skeleton for shell and dashboard segment
 * loading boundaries.
 */
export function DashboardSegmentSkeleton({
  rowKeyPrefix = 'dashboard-loading-row',
}: DashboardSegmentSkeletonProps) {
  return (
    <div className='space-y-3 p-4 sm:p-5' aria-busy='true' aria-live='polite'>
      <div className='flex items-center justify-between gap-3'>
        <div className='space-y-2'>
          <div className='skeleton h-6 w-52 rounded-md' />
          <div className='skeleton h-4 w-72 rounded' />
        </div>
        <div className='skeleton h-8 w-24 rounded-md' />
      </div>

      <div className='space-y-3 rounded-xl border border-subtle/70 bg-surface-0 p-3'>
        <div className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] gap-3 border-b border-subtle/60 pb-2'>
          <div className='skeleton h-3 w-24 rounded' />
          <div className='skeleton h-3 w-16 rounded' />
          <div className='skeleton h-3 w-12 rounded' />
        </div>

        {DASHBOARD_LOADING_ROWS.map(row => (
          <div
            key={`${rowKeyPrefix}-${row}`}
            className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] items-center gap-3 py-1'
          >
            <div className='skeleton h-4 w-full rounded' />
            <div className='skeleton h-4 w-20 rounded' />
            <div className='skeleton h-4 w-12 rounded' />
          </div>
        ))}
      </div>
    </div>
  );
}