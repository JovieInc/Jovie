import { TableSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function ReleasesLoading() {
  return (
    <div className='space-y-6 p-6'>
      {/* Header skeleton */}
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <div className='skeleton h-8 w-40 rounded-md' />
          <div className='skeleton h-4 w-56 rounded-md' />
        </div>
        <div className='flex gap-2'>
          <div className='skeleton h-10 w-48 rounded-md' />
          <div className='skeleton h-10 w-32 rounded-md' />
        </div>
      </div>

      {/* Table skeleton — 7 columns matching the releases table */}
      <TableSkeleton rows={15} columns={7} />
    </div>
  );
}
