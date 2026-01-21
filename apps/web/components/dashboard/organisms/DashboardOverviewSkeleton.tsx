import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const metricSkeletonKeys = ['reach', 'engagement', 'revenue'];
const taskSkeletonKeys = ['handle', 'music', 'social'];

export function DashboardOverviewSkeleton() {
  return (
    <div
      className='space-y-3'
      data-testid='dashboard-overview-skeleton'
      aria-busy='true'
      aria-live='polite'
    >
      <header className='flex flex-col gap-2 rounded-2xl bg-transparent p-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='space-y-2'>
            <LoadingSkeleton height='h-6' width='w-48' />
            <LoadingSkeleton height='h-4' width='w-64' />
          </div>
          <div className='flex items-center gap-2'>
            <LoadingSkeleton height='h-11' width='w-11' rounded='full' />
            <LoadingSkeleton height='h-11' width='w-11' rounded='full' />
          </div>
        </div>
      </header>

      <section className='rounded-2xl bg-surface-1/40 p-3 shadow-none'>
        <div className='grid gap-3 md:grid-cols-3'>
          {metricSkeletonKeys.map(key => (
            <div key={`metric-${key}`} className='space-y-2'>
              <LoadingSkeleton height='h-4' width='w-24' />
              <LoadingSkeleton height='h-8' width='w-32' />
              <LoadingSkeleton height='h-4' width='w-20' />
            </div>
          ))}
        </div>
      </section>

      <section className='rounded-2xl bg-surface-1/40 p-3 shadow-none'>
        <div className='space-y-3'>
          <LoadingSkeleton height='h-5' width='w-40' />
          <LoadingSkeleton height='h-4' width='w-3/4' />
          <div className='grid gap-2 md:grid-cols-3'>
            {taskSkeletonKeys.map(key => (
              <LoadingSkeleton
                key={`task-${key}`}
                height='h-16'
                width='w-full'
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
