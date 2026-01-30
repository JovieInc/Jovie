import { TableSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Loading skeleton for the admin users page.
 */
export default function UsersLoading() {
  return (
    <div className='p-6 space-y-6'>
      {/* Header skeleton */}
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <div className='h-8 w-32 skeleton rounded-md' />
          <div className='h-4 w-48 skeleton rounded-md' />
        </div>
        <div className='flex gap-2'>
          <div className='h-10 w-48 skeleton rounded-md' />
          <div className='h-10 w-24 skeleton rounded-md' />
        </div>
      </div>

      {/* Table skeleton */}
      <TableSkeleton rows={10} columns={4} />
    </div>
  );
}
