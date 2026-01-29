import { TableSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Loading skeleton for the admin waitlist page.
 */
export default function WaitlistLoading() {
  return (
    <div className='p-6 space-y-6'>
      {/* Header skeleton */}
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <div className='h-8 w-48 skeleton rounded-md' />
          <div className='h-4 w-64 skeleton rounded-md' />
        </div>
        <div className='h-10 w-32 skeleton rounded-md' />
      </div>

      {/* Table skeleton */}
      <TableSkeleton rows={10} columns={5} />
    </div>
  );
}
