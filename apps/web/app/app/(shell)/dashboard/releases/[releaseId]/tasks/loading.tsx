export default function TasksLoading() {
  return (
    <div className='mx-auto max-w-2xl px-4 py-6'>
      {/* Breadcrumb skeleton */}
      <div className='mb-4 flex gap-1.5'>
        <div className='h-3 w-14 animate-pulse rounded bg-surface-1' />
        <div className='h-3 w-2 animate-pulse rounded bg-surface-1' />
        <div className='h-3 w-20 animate-pulse rounded bg-surface-1' />
        <div className='h-3 w-2 animate-pulse rounded bg-surface-1' />
        <div className='h-3 w-10 animate-pulse rounded bg-surface-1' />
      </div>

      {/* Progress bar skeleton */}
      <div className='mb-6 px-4 py-2'>
        <div className='mb-1 h-3 w-24 animate-pulse rounded bg-surface-1' />
        <div className='h-1 w-full rounded-full bg-surface-1' />
      </div>

      {/* Task rows skeleton */}
      <div className='space-y-3'>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div
            key={i}
            className='h-10 animate-pulse rounded bg-surface-1'
            style={{ opacity: 1 - i * 0.08 }}
          />
        ))}
      </div>
    </div>
  );
}
