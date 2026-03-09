import { Skeleton } from '@jovie/ui';

export default function AdminLeadsLoading() {
  return (
    <div className='flex flex-col gap-6 p-4 sm:p-6'>
      {/* KPIs skeleton */}
      <section className='space-y-3'>
        <Skeleton className='h-5 w-28 rounded' />
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }, (_, i) => `kpi-${i}`).map(key => (
            <Skeleton key={key} className='h-28 rounded-xl' />
          ))}
        </div>
      </section>

      {/* Controls skeleton */}
      <Skeleton className='h-64 rounded-xl' />

      {/* Keywords skeleton */}
      <Skeleton className='h-48 rounded-xl' />

      {/* Table skeleton */}
      <Skeleton className='h-96 rounded-xl' />
    </div>
  );
}
